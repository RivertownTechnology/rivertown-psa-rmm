using System.Management;
using System.Text.Json;
using Rivertown.Agent.Core.Configuration;
using Rivertown.Agent.Core.Communication;
using Rivertown.Agent.Core.Handlers;
using Rivertown.Agent.Core.Inventory;

namespace Rivertown.Agent.Core;

public class AgentService : BackgroundService
{
    private readonly ILogger<AgentService> _logger;
    private readonly IServiceProvider _services;
    private AgentConfig _config = new();
    private MqttHandler? _mqtt;
    private TerminalHandler? _terminal;

    public AgentService(ILogger<AgentService> logger, IServiceProvider services)
    {
        _logger = logger;
        _services = services;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Rivertown RMM Agent v0.1.0 starting...");

        // 1. Load config
        _config = AgentConfig.Load();
        _logger.LogInformation("Config loaded. Enrolled={IsEnrolled}, AgentId={AgentId}", _config.IsEnrolled, _config.AgentId);

        // 2. Enroll if needed
        if (!_config.IsEnrolled)
        {
            var enrollment = new EnrollmentClient(_services.GetRequiredService<ILogger<EnrollmentClient>>());
            var enrolled = await enrollment.EnrollAsync(_config);
            if (!enrolled)
            {
                _logger.LogError("Enrollment failed. Agent will retry on next start.");
                return;
            }
        }

        // 3. Connect MQTT
        _mqtt = new MqttHandler(_services.GetRequiredService<ILogger<MqttHandler>>());
        _mqtt.OnCommandReceived += HandleCommand;

        try
        {
            await _mqtt.ConnectAsync(_config.MqttBrokerUrl, _config.MqttBrokerPort, _config.TenantId, _config.AgentId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to connect to MQTT broker");
            return;
        }

        // 3.5 Send initial full inventory
        _logger.LogInformation("Collecting initial system inventory...");
        await PublishInventory();

        // 4. Heartbeat loop
        _logger.LogInformation("Agent running. Heartbeating every 60 seconds.");
        var heartbeatCount = 0;
        while (!stoppingToken.IsCancellationRequested)
        {
            heartbeatCount++;

            try
            {
                var heartbeat = CollectHeartbeat();
                await _mqtt.PublishHeartbeatAsync(heartbeat);
                _logger.LogDebug("Heartbeat sent: CPU={Cpu}%, RAM={Ram}MB free", heartbeat.CpuPercent, heartbeat.MemoryFreeMb);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Heartbeat failed");
            }

            // Drive status every 15 minutes (15 heartbeats)
            if (heartbeatCount % 15 == 0)
            {
                try
                {
                    var disks = SystemInfoCollector.CollectDisks();
                    await _mqtt.PublishRawAsync($"rivertown/{_config.TenantId}/{_config.AgentId}/inventory",
                        JsonSerializer.Serialize(new { system = new { disks }, software = (object?)null }));
                }
                catch (Exception ex) { _logger.LogError(ex, "Disk status update failed"); }
            }

            // Full inventory daily (1440 heartbeats = 24 hours)
            if (heartbeatCount % 1440 == 0)
            {
                await PublishInventory();
            }

            await Task.Delay(TimeSpan.FromSeconds(60), stoppingToken);
        }
    }

    private async Task HandleCommand(string commandType, string payloadJson)
    {
        _logger.LogInformation("Received command: {Type}", commandType);

        using var doc = JsonDocument.Parse(payloadJson);
        var commandId = doc.RootElement.GetProperty("commandId").GetString() ?? "";

        switch (commandType)
        {
            case "script_exec":
                await HandleScriptExec(commandId, doc.RootElement);
                break;
            case "ping":
                await _mqtt!.PublishResponseAsync(new { commandId, status = "success", payload = new { message = "pong" }, completedAt = DateTime.UtcNow });
                break;
            case "scan_inventory":
                await PublishInventory();
                await _mqtt!.PublishResponseAsync(new { commandId, status = "success", payload = new { message = "Inventory scan complete" }, completedAt = DateTime.UtcNow });
                break;
            case "scan_software":
                var sw = SystemInfoCollector.CollectInstalledSoftware();
                await _mqtt!.PublishRawAsync($"rivertown/{_config.TenantId}/{_config.AgentId}/inventory",
                    JsonSerializer.Serialize(new { system = (object?)null, software = sw }));
                await _mqtt!.PublishResponseAsync(new { commandId, status = "success", payload = new { message = $"Found {sw.Count} software items" }, completedAt = DateTime.UtcNow });
                break;
            case "scan_disk":
                var disks = SystemInfoCollector.CollectDisks();
                await _mqtt!.PublishRawAsync($"rivertown/{_config.TenantId}/{_config.AgentId}/inventory",
                    JsonSerializer.Serialize(new { system = new { disks }, software = (object?)null }));
                await _mqtt!.PublishResponseAsync(new { commandId, status = "success", payload = new { message = "Disk scan complete" }, completedAt = DateTime.UtcNow });
                break;
            case "terminal_start":
                var termSessionId = doc.RootElement.GetProperty("payload").GetProperty("sessionId").GetString() ?? "";
                _terminal?.Dispose();
                _terminal = new TerminalHandler(_services.GetRequiredService<ILogger<TerminalHandler>>(), _mqtt!, _config.TenantId, _config.AgentId);
                await _terminal.StartSession(termSessionId);
                break;
            case "terminal_input":
                var termInput = doc.RootElement.GetProperty("payload").GetProperty("input").GetString() ?? "";
                if (_terminal != null) await _terminal.SendInput(termInput);
                break;
            case "terminal_stop":
                _terminal?.Dispose();
                _terminal = null;
                break;
            default:
                _logger.LogWarning("Unknown command type: {Type}", commandType);
                await _mqtt!.PublishResponseAsync(new { commandId, status = "error", payload = new { message = $"Unknown command: {commandType}" }, completedAt = DateTime.UtcNow });
                break;
        }
    }

    private async Task HandleScriptExec(string commandId, JsonElement root)
    {
        var script = root.GetProperty("payload").GetProperty("script").GetString() ?? "";
        if (string.IsNullOrEmpty(script))
        {
            await _mqtt!.PublishResponseAsync(new { commandId, status = "error", payload = new { message = "No script provided" }, completedAt = DateTime.UtcNow });
            return;
        }

        // Send in_progress status
        await _mqtt!.PublishResponseAsync(new { commandId, status = "in_progress", payload = new { message = "Executing script..." }, completedAt = DateTime.UtcNow });

        var handler = new ScriptHandler(_services.GetRequiredService<ILogger<ScriptHandler>>());
        var (output, exitCode) = await handler.ExecuteAsync(script);

        await _mqtt!.PublishResponseAsync(new
        {
            commandId,
            status = exitCode == 0 ? "success" : "error",
            payload = new { output, exitCode },
            completedAt = DateTime.UtcNow,
        });
    }

    private async Task PublishInventory()
    {
        try
        {
            var system = SystemInfoCollector.CollectFullInventory();
            var software = SystemInfoCollector.CollectInstalledSoftware();
            var payload = JsonSerializer.Serialize(new { system, software });
            var topic = $"rivertown/{_config.TenantId}/{_config.AgentId}/inventory";
            await _mqtt!.PublishRawAsync(topic, payload);
            _logger.LogInformation("Inventory published ({Count} software items)", software.Count);
        }
        catch (Exception ex) { _logger.LogError(ex, "Failed to publish inventory"); }
    }

    private HeartbeatData CollectHeartbeat()
    {
        var memoryFreeMb = 0L;
        var memoryTotalMb = 0L;
        var diskFreeGb = 0.0;
        var cpuPercent = 0.0;

        try
        {
            using var memSearcher = new ManagementObjectSearcher("SELECT FreePhysicalMemory, TotalVisibleMemorySize FROM Win32_OperatingSystem");
            foreach (var obj in memSearcher.Get())
            {
                memoryFreeMb = Convert.ToInt64(obj["FreePhysicalMemory"]) / 1024;
                memoryTotalMb = Convert.ToInt64(obj["TotalVisibleMemorySize"]) / 1024;
            }

            using var cpuSearcher = new ManagementObjectSearcher("SELECT LoadPercentage FROM Win32_Processor");
            foreach (var obj in cpuSearcher.Get())
            {
                cpuPercent = Convert.ToDouble(obj["LoadPercentage"] ?? 0);
                break;
            }

            var drive = new DriveInfo("C");
            diskFreeGb = Math.Round(drive.AvailableFreeSpace / 1073741824.0, 1);
        }
        catch { }

        // Get IP address
        var ipAddress = "";
        try
        {
            var host = System.Net.Dns.GetHostEntry(System.Net.Dns.GetHostName());
            foreach (var ip in host.AddressList)
            {
                if (ip.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork)
                {
                    ipAddress = ip.ToString();
                    break;
                }
            }
        }
        catch { }

        return new HeartbeatData
        {
            AgentId = _config.AgentId,
            AgentVersion = "0.1.0",
            Hostname = Environment.MachineName,
            OsVersion = Environment.OSVersion.ToString(),
            IpAddress = ipAddress,
            CpuPercent = cpuPercent,
            MemoryFreeMb = memoryFreeMb,
            MemoryTotalMb = memoryTotalMb,
            DiskFreeGb = diskFreeGb,
            Timestamp = DateTime.UtcNow,
        };
    }

    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("Agent stopping...");
        _terminal?.Dispose();
        _mqtt?.Dispose();
        await base.StopAsync(cancellationToken);
    }
}

public record HeartbeatData
{
    public string AgentId { get; init; } = "";
    public string AgentVersion { get; init; } = "";
    public string Hostname { get; init; } = "";
    public string OsVersion { get; init; } = "";
    public string IpAddress { get; init; } = "";
    public double CpuPercent { get; init; }
    public long MemoryFreeMb { get; init; }
    public long MemoryTotalMb { get; init; }
    public double DiskFreeGb { get; init; }
    public DateTime Timestamp { get; init; }
}
