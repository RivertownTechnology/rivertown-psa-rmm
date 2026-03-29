using System.Management;
using System.Net.NetworkInformation;
using System.Text.Json;

namespace Rivertown.Agent.Core.Inventory;

public static class SystemInfoCollector
{
    public static Dictionary<string, string> CollectHardwareInfo()
    {
        // Keep existing basic method for enrollment
        var info = new Dictionary<string, string>
        {
            ["hostname"] = Environment.MachineName,
            ["os"] = Environment.OSVersion.ToString(),
            ["processorCount"] = Environment.ProcessorCount.ToString(),
            ["is64Bit"] = Environment.Is64BitOperatingSystem.ToString(),
        };
        try
        {
            using var cs = new ManagementObjectSearcher("SELECT * FROM Win32_ComputerSystem");
            foreach (var obj in cs.Get()) { info["manufacturer"] = obj["Manufacturer"]?.ToString() ?? ""; info["model"] = obj["Model"]?.ToString() ?? ""; info["totalMemoryBytes"] = obj["TotalPhysicalMemory"]?.ToString() ?? ""; }
            using var os = new ManagementObjectSearcher("SELECT Caption, Version, BuildNumber FROM Win32_OperatingSystem");
            foreach (var obj in os.Get()) { info["osName"] = obj["Caption"]?.ToString() ?? ""; info["osVersion"] = obj["Version"]?.ToString() ?? ""; info["osBuild"] = obj["BuildNumber"]?.ToString() ?? ""; }
            using var proc = new ManagementObjectSearcher("SELECT Name FROM Win32_Processor");
            foreach (var obj in proc.Get()) { info["processor"] = obj["Name"]?.ToString() ?? ""; break; }
            using var bios = new ManagementObjectSearcher("SELECT SerialNumber FROM Win32_BIOS");
            foreach (var obj in bios.Get()) { info["serialNumber"] = obj["SerialNumber"]?.ToString() ?? ""; break; }
        } catch { }
        return info;
    }

    public static object CollectFullInventory()
    {
        return new
        {
            cpu = CollectCpu(),
            memory = CollectMemory(),
            disks = CollectDisks(),
            networkAdapters = CollectNetworkAdapters(),
            os = CollectOs(),
            domain = CollectDomain(),
            bios = CollectBios(),
            antivirus = CollectAntivirus(),
            lastBoot = GetLastBoot(),
        };
    }

    public static List<object> CollectInstalledSoftware()
    {
        var software = new List<object>();
        var seenNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        try
        {
            using var searcher = new ManagementObjectSearcher("SELECT Name, Version, Vendor, InstallDate FROM Win32_Product");
            foreach (var obj in searcher.Get())
            {
                var name = obj["Name"]?.ToString();
                if (string.IsNullOrEmpty(name)) continue;
                seenNames.Add(name);
                software.Add(new { name, version = obj["Version"]?.ToString() ?? "", publisher = obj["Vendor"]?.ToString() ?? "", installDate = obj["InstallDate"]?.ToString() ?? "" });
            }
        }
        catch { }

        // Also check registry for more complete list
        try
        {
            var regPaths = new[] { @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall", @"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall" };
            foreach (var path in regPaths)
            {
                using var key = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(path);
                if (key == null) continue;
                foreach (var subKeyName in key.GetSubKeyNames())
                {
                    using var subKey = key.OpenSubKey(subKeyName);
                    var name = subKey?.GetValue("DisplayName")?.ToString();
                    if (string.IsNullOrEmpty(name)) continue;
                    if (seenNames.Contains(name)) continue;
                    seenNames.Add(name);
                    software.Add(new {
                        name,
                        version = subKey?.GetValue("DisplayVersion")?.ToString() ?? "",
                        publisher = subKey?.GetValue("Publisher")?.ToString() ?? "",
                        installDate = subKey?.GetValue("InstallDate")?.ToString() ?? "",
                    });
                }
            }
        }
        catch { }

        return software.OrderBy(s => (s as dynamic)?.name?.ToString() ?? "").ToList();
    }

    public static List<object> CollectDisks()
    {
        var disks = new List<object>();
        try
        {
            // Map physical disk index → model name
            var diskModels = new Dictionary<string, string>();
            using (var searcher = new ManagementObjectSearcher("SELECT DeviceID, Model, MediaType, Size FROM Win32_DiskDrive"))
            {
                foreach (var obj in searcher.Get())
                {
                    var deviceId = obj["DeviceID"]?.ToString() ?? "";
                    diskModels[deviceId] = obj["Model"]?.ToString() ?? "";
                }
            }

            // Map partition → physical disk via Win32_DiskDriveToDiskPartition
            var partitionToDisk = new Dictionary<string, string>();
            using (var searcher = new ManagementObjectSearcher("SELECT Antecedent, Dependent FROM Win32_DiskDriveToDiskPartition"))
            {
                foreach (var obj in searcher.Get())
                {
                    var disk = obj["Antecedent"]?.ToString() ?? "";
                    var partition = obj["Dependent"]?.ToString() ?? "";
                    // Extract DeviceID from the WMI path
                    var diskMatch = System.Text.RegularExpressions.Regex.Match(disk, @"DeviceID=""([^""]+)""");
                    var partMatch = System.Text.RegularExpressions.Regex.Match(partition, @"DeviceID=""([^""]+)""");
                    if (diskMatch.Success && partMatch.Success)
                        partitionToDisk[partMatch.Groups[1].Value] = diskMatch.Groups[1].Value;
                }
            }

            // Map logical disk → partition via Win32_LogicalDiskToPartition
            var logicalToPartition = new Dictionary<string, string>();
            using (var searcher = new ManagementObjectSearcher("SELECT Antecedent, Dependent FROM Win32_LogicalDiskToPartition"))
            {
                foreach (var obj in searcher.Get())
                {
                    var partition = obj["Antecedent"]?.ToString() ?? "";
                    var logical = obj["Dependent"]?.ToString() ?? "";
                    var partMatch = System.Text.RegularExpressions.Regex.Match(partition, @"DeviceID=""([^""]+)""");
                    var logMatch = System.Text.RegularExpressions.Regex.Match(logical, @"DeviceID=""([^""]+)""");
                    if (partMatch.Success && logMatch.Success)
                        logicalToPartition[logMatch.Groups[1].Value] = partMatch.Groups[1].Value;
                }
            }

            // Build final list: one entry per logical volume with its physical disk name
            foreach (var drive in DriveInfo.GetDrives().Where(d => d.IsReady && d.DriveType == DriveType.Fixed))
            {
                var letter = drive.Name.TrimEnd('\\');
                var model = "";

                // Resolve: logical → partition → physical disk → model
                if (logicalToPartition.TryGetValue(letter, out var partition))
                {
                    if (partitionToDisk.TryGetValue(partition, out var diskId))
                    {
                        diskModels.TryGetValue(diskId, out model);
                    }
                }

                disks.Add(new
                {
                    letter = drive.Name,
                    label = drive.VolumeLabel,
                    model = model ?? "",
                    totalGb = Math.Round(drive.TotalSize / 1073741824.0, 1),
                    freeGb = Math.Round(drive.AvailableFreeSpace / 1073741824.0, 1),
                    format = drive.DriveFormat,
                    type = "Fixed",
                });
            }
        }
        catch { }
        return disks;
    }

    private static object CollectCpu()
    {
        try
        {
            using var searcher = new ManagementObjectSearcher("SELECT Name, NumberOfCores, NumberOfLogicalProcessors, MaxClockSpeed FROM Win32_Processor");
            foreach (var obj in searcher.Get())
                return new { name = obj["Name"]?.ToString()?.Trim() ?? "", cores = Convert.ToInt32(obj["NumberOfCores"] ?? 0), threads = Convert.ToInt32(obj["NumberOfLogicalProcessors"] ?? 0), speedMhz = Convert.ToInt32(obj["MaxClockSpeed"] ?? 0) };
        } catch { }
        return new { name = "", cores = Environment.ProcessorCount, threads = Environment.ProcessorCount, speedMhz = 0 };
    }

    private static object CollectMemory()
    {
        var slots = new List<object>();
        long totalMb = 0;
        try
        {
            using var searcher = new ManagementObjectSearcher("SELECT Capacity, Speed, MemoryType FROM Win32_PhysicalMemory");
            foreach (var obj in searcher.Get())
            {
                var cap = Convert.ToInt64(obj["Capacity"] ?? 0);
                totalMb += cap / (1024 * 1024);
                slots.Add(new { sizeMb = cap / (1024 * 1024), speed = Convert.ToInt32(obj["Speed"] ?? 0) });
            }
        } catch { }
        return new { totalMb, slots };
    }

    private static object CollectNetworkAdapters()
    {
        var adapters = new List<object>();
        try
        {
            foreach (var nic in NetworkInterface.GetAllNetworkInterfaces().Where(n => n.OperationalStatus == OperationalStatus.Up && n.NetworkInterfaceType != NetworkInterfaceType.Loopback))
            {
                var props = nic.GetIPProperties();
                var ipv4 = props.UnicastAddresses.FirstOrDefault(a => a.Address.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork);
                adapters.Add(new {
                    name = nic.Name, description = nic.Description,
                    macAddress = nic.GetPhysicalAddress().ToString(),
                    ipAddress = ipv4?.Address.ToString() ?? "",
                    speed = nic.Speed > 0 ? $"{nic.Speed / 1000000} Mbps" : "",
                    type = nic.NetworkInterfaceType.ToString(),
                });
            }
        } catch { }
        return adapters;
    }

    private static object CollectOs()
    {
        try
        {
            using var searcher = new ManagementObjectSearcher("SELECT Caption, Version, BuildNumber, OSArchitecture, InstallDate FROM Win32_OperatingSystem");
            foreach (var obj in searcher.Get())
                return new { name = obj["Caption"]?.ToString()?.Trim() ?? "", version = obj["Version"]?.ToString() ?? "", build = obj["BuildNumber"]?.ToString() ?? "", arch = obj["OSArchitecture"]?.ToString() ?? "", installDate = obj["InstallDate"]?.ToString() ?? "" };
        } catch { }
        return new { name = Environment.OSVersion.ToString(), version = "", build = "", arch = Environment.Is64BitOperatingSystem ? "64-bit" : "32-bit", installDate = "" };
    }

    private static object CollectDomain()
    {
        try
        {
            using var searcher = new ManagementObjectSearcher("SELECT Domain, DomainRole, PartOfDomain FROM Win32_ComputerSystem");
            foreach (var obj in searcher.Get())
            {
                var partOfDomain = Convert.ToBoolean(obj["PartOfDomain"] ?? false);
                var domainRole = Convert.ToInt32(obj["DomainRole"] ?? 0);
                var type = partOfDomain ? "domain" : "workgroup";
                return new { type, name = obj["Domain"]?.ToString() ?? "", joined = partOfDomain, role = domainRole };
            }
        } catch { }
        return new { type = "workgroup", name = "WORKGROUP", joined = false, role = 0 };
    }

    private static object CollectBios()
    {
        try
        {
            using var searcher = new ManagementObjectSearcher("SELECT Manufacturer, SMBIOSBIOSVersion, SerialNumber FROM Win32_BIOS");
            foreach (var obj in searcher.Get())
                return new { manufacturer = obj["Manufacturer"]?.ToString() ?? "", version = obj["SMBIOSBIOSVersion"]?.ToString() ?? "", serialNumber = obj["SerialNumber"]?.ToString() ?? "" };
        } catch { }
        return new { manufacturer = "", version = "", serialNumber = "" };
    }

    private static object CollectAntivirus()
    {
        try
        {
            using var searcher = new ManagementObjectSearcher(@"root\SecurityCenter2", "SELECT displayName, productState FROM AntiVirusProduct");
            foreach (var obj in searcher.Get())
            {
                var state = Convert.ToUInt32(obj["productState"] ?? 0);
                var enabled = ((state >> 12) & 0xF) == 1;
                var upToDate = ((state >> 4) & 0xF) == 0;
                return new { name = obj["displayName"]?.ToString() ?? "", enabled, upToDate, realTimeProtection = enabled };
            }
        } catch { }
        return new { name = "Unknown", enabled = false, upToDate = false, realTimeProtection = false };
    }

    private static string GetLastBoot()
    {
        try
        {
            using var searcher = new ManagementObjectSearcher("SELECT LastBootUpTime FROM Win32_OperatingSystem");
            foreach (var obj in searcher.Get())
            {
                var bootTime = ManagementDateTimeConverter.ToDateTime(obj["LastBootUpTime"]?.ToString() ?? "");
                return bootTime.ToUniversalTime().ToString("o");
            }
        } catch { }
        return "";
    }
}
