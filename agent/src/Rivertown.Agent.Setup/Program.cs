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

        // If no args, check for config.json in same directory (baked-in installer)
        if (token == null)
        {
            var configJsonPath = Path.Combine(Path.GetDirectoryName(Environment.ProcessPath!) ?? ".", "install-config.json");
            if (File.Exists(configJsonPath))
            {
                try
                {
                    var json = JsonSerializer.Deserialize<JsonElement>(File.ReadAllText(configJsonPath));
                    token = json.TryGetProperty("token", out var t) ? t.GetString() : null;
                    apiUrl = json.TryGetProperty("apiUrl", out var a) ? a.GetString() : null;
                    mqttUrl = json.TryGetProperty("mqttUrl", out var m) ? m.GetString() : null;
                }
                catch { }
            }
        }

        if (string.IsNullOrEmpty(token) || string.IsNullOrEmpty(apiUrl))
        {
            ShowError("Usage: RivertownAgentSetup.exe --token TOKEN --api https://psa.example.com\n\nEnrollment token and API URL are required.");
            return 1;
        }

        mqttUrl ??= "wss://rmm." + new Uri(apiUrl).Host.Replace("psa.", "");

        try
        {
            // 1. Stop existing service if running
            StopExistingService();

            // 2. Create directories
            Directory.CreateDirectory(InstallPath);
            Directory.CreateDirectory(ConfigDir);

            // 3. Download agent binaries from API
            if (!silent) ShowProgress("Downloading agent...");
            DownloadAgentFiles(apiUrl).GetAwaiter().GetResult();

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

    static async Task DownloadAgentFiles(string apiUrl)
    {
        using var http = new HttpClient { Timeout = TimeSpan.FromMinutes(5) };
        var downloadUrl = $"{apiUrl.TrimEnd('/')}/api/v1/rmm/agent/download/latest/win-x64";

        // Download zip
        var zipPath = Path.Combine(Path.GetTempPath(), "rivertown-agent.zip");
        try
        {
            using var response = await http.GetAsync(downloadUrl, HttpCompletionOption.ResponseHeadersRead);
            if (response.IsSuccessStatusCode)
            {
                await using var fs = File.Create(zipPath);
                await response.Content.CopyToAsync(fs);
                fs.Close();

                // Extract
                System.IO.Compression.ZipFile.ExtractToDirectory(zipPath, InstallPath, true);
                return;
            }
        }
        catch { /* fall through to copy from local */ }
        finally { if (File.Exists(zipPath)) File.Delete(zipPath); }

        // Fallback: copy files from the setup's directory (for bundled installers)
        var setupDir = Path.GetDirectoryName(Environment.ProcessPath!) ?? ".";
        foreach (var file in Directory.GetFiles(setupDir, "Rivertown.Agent.*"))
        {
            var dest = Path.Combine(InstallPath, Path.GetFileName(file));
            File.Copy(file, dest, true);
        }
        var updater = Path.Combine(setupDir, "RivertownUpdater.exe");
        if (File.Exists(updater)) File.Copy(updater, Path.Combine(InstallPath, "RivertownUpdater.exe"), true);
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
