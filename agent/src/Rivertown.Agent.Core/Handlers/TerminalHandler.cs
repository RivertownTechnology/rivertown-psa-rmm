using System.Diagnostics;
using System.Text;
using Rivertown.Agent.Core.Communication;

namespace Rivertown.Agent.Core.Handlers;

public class TerminalHandler : IDisposable
{
    private readonly ILogger<TerminalHandler> _logger;
    private readonly MqttHandler _mqtt;
    private readonly string _tenantId;
    private readonly string _agentId;
    private Process? _process;
    private string _sessionId = "";
    private bool _running = false;

    public TerminalHandler(ILogger<TerminalHandler> logger, MqttHandler mqtt, string tenantId, string agentId)
    {
        _logger = logger;
        _mqtt = mqtt;
        _tenantId = tenantId;
        _agentId = agentId;
    }

    public async Task StartSession(string sessionId)
    {
        _sessionId = sessionId;
        _running = true;
        _logger.LogInformation("Starting terminal session {SessionId}", sessionId);

        var psi = new ProcessStartInfo
        {
            FileName = "powershell.exe",
            Arguments = "-NoLogo -NoProfile -ExecutionPolicy Bypass",
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
        };

        _process = new Process { StartInfo = psi };
        _process.OutputDataReceived += async (_, e) =>
        {
            if (e.Data != null && _running)
            {
                await PublishOutput(e.Data + "\n");
            }
        };
        _process.ErrorDataReceived += async (_, e) =>
        {
            if (e.Data != null && _running)
            {
                await PublishOutput(e.Data + "\n");
            }
        };

        _process.Start();
        _process.BeginOutputReadLine();
        _process.BeginErrorReadLine();

        await PublishOutput("PowerShell terminal connected (running as SYSTEM)\r\nPS> ");
    }

    public async Task SendInput(string input)
    {
        if (_process == null || _process.HasExited) return;
        await _process.StandardInput.WriteLineAsync(input);
        // Echo a new prompt after a small delay
        _ = Task.Run(async () =>
        {
            await Task.Delay(100);
            // The output will come through OutputDataReceived
            // Send a prompt hint after output settles
            await Task.Delay(500);
            if (_running) await PublishOutput("PS> ");
        });
    }

    public void StopSession()
    {
        _running = false;
        _logger.LogInformation("Stopping terminal session {SessionId}", _sessionId);
        try
        {
            if (_process != null && !_process.HasExited)
            {
                _process.StandardInput.WriteLine("exit");
                _process.WaitForExit(3000);
                if (!_process.HasExited) _process.Kill(true);
            }
        }
        catch { }
        _process?.Dispose();
        _process = null;
    }

    private async Task PublishOutput(string output)
    {
        var topic = $"rivertown/{_tenantId}/{_agentId}/terminal/{_sessionId}";
        var payload = System.Text.Json.JsonSerializer.Serialize(new { type = "output", data = output });
        await _mqtt.PublishRawAsync(topic, payload);
    }

    public void Dispose()
    {
        StopSession();
    }
}
