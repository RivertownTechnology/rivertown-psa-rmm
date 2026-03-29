using System.Diagnostics;
using System.Text.Json;

namespace Rivertown.Agent.Core.Handlers;

public class ScriptHandler
{
    private readonly ILogger<ScriptHandler> _logger;

    public ScriptHandler(ILogger<ScriptHandler> logger)
    {
        _logger = logger;
    }

    public async Task<(string output, int exitCode)> ExecuteAsync(string script, int timeoutSeconds = 300)
    {
        _logger.LogInformation("Executing PowerShell script ({Length} chars)...", script.Length);

        var psi = new ProcessStartInfo
        {
            FileName = "powershell.exe",
            Arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -Command -",
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
        };

        using var process = new Process { StartInfo = psi };
        var output = new System.Text.StringBuilder();

        process.OutputDataReceived += (_, e) => { if (e.Data != null) output.AppendLine(e.Data); };
        process.ErrorDataReceived += (_, e) => { if (e.Data != null) output.AppendLine($"ERROR: {e.Data}"); };

        process.Start();
        process.BeginOutputReadLine();
        process.BeginErrorReadLine();

        await process.StandardInput.WriteLineAsync(script);
        process.StandardInput.Close();

        var exited = process.WaitForExit(timeoutSeconds * 1000);
        if (!exited)
        {
            process.Kill(true);
            return ("Script execution timed out", -1);
        }

        return (output.ToString().TrimEnd(), process.ExitCode);
    }
}
