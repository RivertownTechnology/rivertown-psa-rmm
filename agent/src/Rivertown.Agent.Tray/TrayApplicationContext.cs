using System.ServiceProcess;
using System.Text.Json;
using System.Net.Http.Json;

namespace Rivertown.Agent.Tray;

public class TrayApplicationContext : ApplicationContext
{
    private readonly NotifyIcon _trayIcon;
    private readonly ToolStripMenuItem _statusItem;
    private readonly ToolStripMenuItem _versionItem;
    private readonly System.Windows.Forms.Timer _pollTimer;
    private readonly string _configDir;
    private readonly HttpClient _http = new() { Timeout = TimeSpan.FromSeconds(10) };

    public TrayApplicationContext()
    {
        _configDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
            "Rivertown", "Agent"
        );

        _statusItem = new ToolStripMenuItem("Status: Checking...") { Enabled = false };
        _versionItem = new ToolStripMenuItem("Version: --") { Enabled = false };

        var contextMenu = new ContextMenuStrip();
        contextMenu.Items.Add(_statusItem);
        contextMenu.Items.Add(_versionItem);
        contextMenu.Items.Add(new ToolStripSeparator());
        contextMenu.Items.Add("Check for Updates", null, OnCheckUpdates);
        contextMenu.Items.Add(new ToolStripSeparator());
        contextMenu.Items.Add("About", null, OnAbout);
        contextMenu.Items.Add("Exit", null, OnExit);

        _trayIcon = new NotifyIcon
        {
            Icon = SystemIcons.Shield,
            Text = "Rivertown RMM Agent",
            ContextMenuStrip = contextMenu,
            Visible = true,
        };

        _trayIcon.DoubleClick += OnAbout;

        // Poll service status every 10 seconds
        _pollTimer = new System.Windows.Forms.Timer { Interval = 10000 };
        _pollTimer.Tick += (_, _) => UpdateStatus();
        _pollTimer.Start();

        // Initial check
        UpdateStatus();
    }

    private void UpdateStatus()
    {
        try
        {
            // Read status file written by the service
            var statusPath = Path.Combine(_configDir, "agent-status.json");
            if (File.Exists(statusPath))
            {
                var json = File.ReadAllText(statusPath);
                var status = JsonSerializer.Deserialize<JsonElement>(json);
                var connected = status.GetProperty("connected").GetBoolean();
                var version = status.GetProperty("agentVersion").GetString() ?? "--";
                var lastHb = status.TryGetProperty("lastHeartbeat", out var hb) ? hb.GetString() : null;

                _versionItem.Text = $"Version: {version}";

                // Check if status file is stale (>2 min old)
                var updatedAt = status.TryGetProperty("updatedAt", out var ua)
                    ? DateTimeOffset.Parse(ua.GetString()!).UtcDateTime
                    : DateTime.MinValue;
                var stale = (DateTime.UtcNow - updatedAt).TotalMinutes > 2;

                if (stale)
                {
                    _statusItem.Text = "Status: Service stopped";
                    _trayIcon.Icon = SystemIcons.Error;
                    _trayIcon.Text = "Rivertown RMM - Stopped";
                }
                else if (connected)
                {
                    _statusItem.Text = "Status: Connected";
                    _trayIcon.Icon = SystemIcons.Shield;
                    _trayIcon.Text = "Rivertown RMM - Connected";
                }
                else
                {
                    _statusItem.Text = "Status: Disconnected";
                    _trayIcon.Icon = SystemIcons.Warning;
                    _trayIcon.Text = "Rivertown RMM - Disconnected";
                }
            }
            else
            {
                // Check if service is at least running
                try
                {
                    using var sc = new ServiceController("RivertownRMMAgent");
                    if (sc.Status == ServiceControllerStatus.Running)
                    {
                        _statusItem.Text = "Status: Running (no heartbeat yet)";
                        _trayIcon.Icon = SystemIcons.Warning;
                    }
                    else
                    {
                        _statusItem.Text = $"Status: {sc.Status}";
                        _trayIcon.Icon = SystemIcons.Error;
                    }
                }
                catch
                {
                    _statusItem.Text = "Status: Service not installed";
                    _trayIcon.Icon = SystemIcons.Error;
                }
            }
        }
        catch { _statusItem.Text = "Status: Error"; }
    }

    private async void OnCheckUpdates(object? sender, EventArgs e)
    {
        try
        {
            // Read API URL from config
            var configPath = Path.Combine(_configDir, "agent-config.json");
            if (!File.Exists(configPath))
            {
                MessageBox.Show("Agent config not found.", "Update Check", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }
            var config = JsonSerializer.Deserialize<JsonElement>(File.ReadAllText(configPath));
            var apiUrl = config.GetProperty("ApiBaseUrl").GetString()?.TrimEnd('/') ?? "";
            var statusPath = Path.Combine(_configDir, "agent-status.json");
            var currentVersion = "0.0.0";
            if (File.Exists(statusPath))
            {
                var status = JsonSerializer.Deserialize<JsonElement>(File.ReadAllText(statusPath));
                currentVersion = status.GetProperty("agentVersion").GetString() ?? "0.0.0";
            }

            var res = await _http.GetFromJsonAsync<JsonElement>($"{apiUrl}/api/v1/rmm/agent/version?current={currentVersion}&platform=win-x64");
            var updateAvailable = res.GetProperty("updateAvailable").GetBoolean();
            var latestVersion = res.GetProperty("latestVersion").GetString() ?? currentVersion;

            if (updateAvailable)
            {
                var result = MessageBox.Show(
                    $"Update available: v{currentVersion} → v{latestVersion}\n\nWould you like to update now?",
                    "Rivertown RMM Update", MessageBoxButtons.YesNo, MessageBoxIcon.Information
                );
                if (result == DialogResult.Yes)
                {
                    _trayIcon.ShowBalloonTip(3000, "Updating...", $"Downloading v{latestVersion}...", ToolTipIcon.Info);
                    // The service handles the actual update when it checks next, or we can trigger via the API
                }
            }
            else
            {
                MessageBox.Show($"You are running the latest version (v{currentVersion}).", "Rivertown RMM Update", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Update check failed:\n{ex.Message}", "Update Check", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void OnAbout(object? sender, EventArgs e)
    {
        var version = "--";
        var agentId = "--";
        var enrolled = false;

        try
        {
            var statusPath = Path.Combine(_configDir, "agent-status.json");
            if (File.Exists(statusPath))
            {
                var status = JsonSerializer.Deserialize<JsonElement>(File.ReadAllText(statusPath));
                version = status.GetProperty("agentVersion").GetString() ?? "--";
                agentId = status.TryGetProperty("agentId", out var aid) ? aid.GetString() ?? "--" : "--";
            }
            var configPath = Path.Combine(_configDir, "agent-config.json");
            if (File.Exists(configPath))
            {
                var config = JsonSerializer.Deserialize<JsonElement>(File.ReadAllText(configPath));
                enrolled = config.TryGetProperty("IsEnrolled", out var ie) && ie.GetBoolean();
            }
        }
        catch { }

        MessageBox.Show(
            $"Rivertown RMM Agent\n\n" +
            $"Version: {version}\n" +
            $"Machine: {Environment.MachineName}\n" +
            $"Agent ID: {agentId}\n" +
            $"Enrolled: {(enrolled ? "Yes" : "No")}\n\n" +
            $"© Rivertown Technology 2026",
            "About Rivertown RMM", MessageBoxButtons.OK, MessageBoxIcon.Information
        );
    }

    private void OnExit(object? sender, EventArgs e)
    {
        _pollTimer.Stop();
        _trayIcon.Visible = false;
        _trayIcon.Dispose();
        Application.Exit();
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _pollTimer.Dispose();
            _trayIcon.Dispose();
            _http.Dispose();
        }
        base.Dispose(disposing);
    }
}
