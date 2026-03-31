using System.Diagnostics;
using System.Security.Principal;
using System.ServiceProcess;
using System.Text.Json;

/// <summary>
/// Rivertown RMM Agent Setup
/// Downloads agent binaries from the API, installs as Windows Service, configures enrollment.
/// Usage: RivertownAgentSetup.exe --token TOKEN --api https://psa.example.com --mqtt wss://rmm.example.com [--silent]
/// </summary>

namespace Rivertown.Agent.Setup;

static class Program
{
    const string ServiceName = "RivertownRMMAgent";
    const string ServiceDisplayName = "Rivertown RMM Agent";
    const string ServiceDescription = "Rivertown PSA/RMM endpoint management agent";
    static string InstallPath = @"C:\Program Files\Rivertown\Agent";
    static string ConfigDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "Rivertown", "Agent");

    [STAThread]
    static int Main(string[] args)
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);

        // Check admin
        if (!new WindowsPrincipal(WindowsIdentity.GetCurrent()).IsInRole(WindowsBuiltInRole.Administrator))
        {
            // Re-launch as admin
            try
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = Environment.ProcessPath!,
                    Arguments = string.Join(" ", args.Select(a => a.Contains(' ') ? $"\"{a}\"" : a)),
                    Verb = "runas",
                    UseShellExecute = true,
                });
                return 0;
            }
            catch
            {
                ShowError("This installer requires administrator privileges.");
                return 1;
            }
        }

        // Parse command-line args
        string? token = null, apiUrl = null, mqttUrl = null;
        bool silent = false;

        for (int i = 0; i < args.Length; i++)
        {
            switch (args[i].ToLower())
            {
                case "--token": case "-t": token = args[++i]; break;
                case "--api": case "-a": apiUrl = args[++i]; break;
                case "--mqtt": case "-m": mqttUrl = args[++i]; break;
                case "--silent": case "-s": silent = true; break;
                case "--install-path": InstallPath = args[++i]; break;
            }
        }

        // Try to extract enrollment token from own filename: RivertownRMM_KEYHERE.exe
        if (token == null)
        {
            var exeName = Path.GetFileNameWithoutExtension(Environment.ProcessPath ?? "");
            var match = System.Text.RegularExpressions.Regex.Match(exeName, @"RivertownRMM_(.+)");
            if (match.Success)
            {
                token = match.Groups[1].Value;
            }
        }

        // Also check for install-config.json in same directory
        if (token == null || apiUrl == null)
        {
            var configJsonPath = Path.Combine(Path.GetDirectoryName(Environment.ProcessPath!) ?? ".", "install-config.json");
            if (File.Exists(configJsonPath))
            {
                try
                {
                    var json = JsonSerializer.Deserialize<JsonElement>(File.ReadAllText(configJsonPath));
                    token ??= json.TryGetProperty("token", out var t) ? t.GetString() : null;
                    apiUrl ??= json.TryGetProperty("apiUrl", out var a) ? a.GetString() : null;
                    mqttUrl ??= json.TryGetProperty("mqttUrl", out var m) ? m.GetString() : null;
                }
                catch { }
            }
        }

        // Default API URL
        apiUrl ??= "https://psa.rivertowntechnology.com";

        if (string.IsNullOrEmpty(token))
        {
            ShowError("Enrollment token not found.\n\nEither:\n• Rename this file to RivertownRMM_YOURKEY.exe\n• Or run with: --token TOKEN --api URL");
            return 1;
        }

        // If token looks like a short key (not a JWT), exchange it for the full token
        if (!token.Contains('.'))
        {
            if (!silent) ShowProgress("Resolving enrollment key...");
            try
            {
                using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(15) };
                var res = http.GetAsync($"{apiUrl}/api/v1/rmm/enroll-key/{token}").Result;
                if (!res.IsSuccessStatusCode)
                {
                    ShowError($"Invalid or expired enrollment key.\n\nHTTP {(int)res.StatusCode}: {res.Content.ReadAsStringAsync().Result}");
                    return 1;
                }
                var data = JsonSerializer.Deserialize<JsonElement>(res.Content.ReadAsStringAsync().Result);
                token = data.GetProperty("token").GetString()!;
                apiUrl = data.TryGetProperty("apiUrl", out var au) ? au.GetString() ?? apiUrl : apiUrl;
                mqttUrl = data.TryGetProperty("mqttUrl", out var mu) ? mu.GetString() : null;
            }
            catch (Exception ex)
            {
                ShowError($"Failed to resolve enrollment key:\n{ex.Message}\n\nCheck your internet connection and try again.");
                return 1;
            }
        }

        mqttUrl ??= "wss://rmm." + new Uri(apiUrl).Host.Replace("psa.", "");

        try
        {
            // 1. Stop existing service if running
            StopExistingService();

            // 2. Create directories
            Directory.CreateDirectory(InstallPath);
            Directory.CreateDirectory(ConfigDir);

            // 3. Extract embedded agent binaries (or download if not embedded)
            if (!silent) ShowProgress("Installing agent files...");
            ExtractOrDownloadAgent(apiUrl).GetAwaiter().GetResult();

            // 4. Write config
            var config = new
            {
                AgentId = "",
                TenantId = "",
                CustomerId = "",
                MqttBrokerUrl = mqttUrl,
                MqttBrokerPort = 0,
                ApiBaseUrl = apiUrl,
                EnrollmentToken = token,
                IsEnrolled = false,
            };
            File.WriteAllText(
                Path.Combine(ConfigDir, "agent-config.json"),
                JsonSerializer.Serialize(config, new JsonSerializerOptions { WriteIndented = true })
            );

            // 5. Install Windows Service
            var exePath = Path.Combine(InstallPath, "Rivertown.Agent.Core.exe");
            RunCommand("sc.exe", $"create {ServiceName} binPath= \"\\\"{exePath}\\\"\" start= auto DisplayName= \"{ServiceDisplayName}\"");
            RunCommand("sc.exe", $"description {ServiceName} \"{ServiceDescription}\"");
            RunCommand("sc.exe", $"failure {ServiceName} reset= 86400 actions= restart/5000/restart/10000/restart/30000");

            // 6. Start the service
            RunCommand("sc.exe", $"start {ServiceName}");

            // 7. Install tray app as startup item
            var trayExe = Path.Combine(InstallPath, "Rivertown.Agent.Tray.exe");
            if (File.Exists(trayExe))
            {
                var startupFolder = Environment.GetFolderPath(Environment.SpecialFolder.CommonStartup);
                var shortcutPath = Path.Combine(startupFolder, "Rivertown RMM Agent.lnk");
                // Simple: just copy a .url file or use a bat
                File.WriteAllText(
                    Path.Combine(startupFolder, "Rivertown RMM Agent.bat"),
                    $"@echo off\nstart \"\" \"{trayExe}\""
                );
                // Also start it now
                Process.Start(new ProcessStartInfo { FileName = trayExe, UseShellExecute = true });
            }

            if (!silent)
            {
                MessageBox.Show(
                    "Rivertown RMM Agent installed successfully!\n\n" +
                    "The agent will now:\n" +
                    "• Enroll with the server using the provided token\n" +
                    "• Connect to MQTT for real-time communication\n" +
                    "• Begin sending heartbeats every 60 seconds\n\n" +
                    "Check the RMM section in the dashboard to verify the agent appears.",
                    "Installation Complete", MessageBoxButtons.OK, MessageBoxIcon.Information
                );
            }

            return 0;
        }
        catch (Exception ex)
        {
            ShowError($"Installation failed:\n{ex.Message}");
            return 1;
        }
    }

    static async Task ExtractOrDownloadAgent(string apiUrl)
    {
        var assembly = System.Reflection.Assembly.GetExecutingAssembly();
        var resourceNames = assembly.GetManifestResourceNames();
        var embeddedFiles = new[] { "Rivertown.Agent.Core.exe", "Rivertown.Agent.Tray.exe", "RivertownUpdater.exe" };
        var extracted = 0;

        // Try embedded resources first (single-file installer)
        foreach (var fileName in embeddedFiles)
        {
            using var stream = assembly.GetManifestResourceStream(fileName);
            if (stream != null)
            {
                var destPath = Path.Combine(InstallPath, fileName);
                using var fs = File.Create(destPath);
                await stream.CopyToAsync(fs);
                extracted++;
            }
        }

        if (extracted > 0)
        {
            Console.WriteLine($"Extracted {extracted} embedded files");
            return;
        }

        // Fallback: download from API
        Console.WriteLine("No embedded files — downloading from API...");
        using var http = new HttpClient { Timeout = TimeSpan.FromMinutes(5) };
        var downloadUrl = $"{apiUrl.TrimEnd('/')}/api/v1/rmm/agent/download/latest/win-x64";
        var zipPath = Path.Combine(Path.GetTempPath(), "rivertown-agent.zip");
        try
        {
            using var response = await http.GetAsync(downloadUrl, HttpCompletionOption.ResponseHeadersRead);
            if (response.IsSuccessStatusCode)
            {
                await using var fs = File.Create(zipPath);
                await response.Content.CopyToAsync(fs);
                fs.Close();
                System.IO.Compression.ZipFile.ExtractToDirectory(zipPath, InstallPath, true);
                return;
            }
        }
        catch { /* fall through */ }
        finally { if (File.Exists(zipPath)) File.Delete(zipPath); }

        // Last resort: copy from same directory as setup exe
        var setupDir = Path.GetDirectoryName(Environment.ProcessPath!) ?? ".";
        foreach (var file in Directory.GetFiles(setupDir, "Rivertown.Agent.*").Concat(Directory.GetFiles(setupDir, "RivertownUpdater*")))
        {
            File.Copy(file, Path.Combine(InstallPath, Path.GetFileName(file)), true);
        }
    }

    static void StopExistingService()
    {
        try
        {
            using var sc = new ServiceController(ServiceName);
            if (sc.Status == ServiceControllerStatus.Running || sc.Status == ServiceControllerStatus.StartPending)
            {
                sc.Stop();
                sc.WaitForStatus(ServiceControllerStatus.Stopped, TimeSpan.FromSeconds(15));
            }
        }
        catch { /* service may not exist yet */ }

        // Delete old service registration
        try { RunCommand("sc.exe", $"delete {ServiceName}"); Thread.Sleep(1000); } catch { }
    }

    static void RunCommand(string file, string args)
    {
        var p = Process.Start(new ProcessStartInfo
        {
            FileName = file,
            Arguments = args,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        });
        p?.WaitForExit(30000);
    }

    static void ShowError(string message)
    {
        MessageBox.Show(message, "Rivertown RMM Agent Setup", MessageBoxButtons.OK, MessageBoxIcon.Error);
    }

    static void ShowProgress(string message)
    {
        // For now just console output; could add a progress dialog later
        Console.WriteLine(message);
    }
}
