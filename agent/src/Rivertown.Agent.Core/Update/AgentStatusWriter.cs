using System.Reflection;
using System.Text.Json;

namespace Rivertown.Agent.Core.Update;

public static class AgentStatusWriter
{
    private static readonly string StatusDir = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
        "Rivertown", "Agent"
    );
    private static readonly string StatusPath = Path.Combine(StatusDir, "agent-status.json");

    public static string GetVersion()
    {
        return Assembly.GetExecutingAssembly()
            .GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion
            ?? Assembly.GetExecutingAssembly().GetName().Version?.ToString(3)
            ?? "0.0.0";
    }

    public static void WriteStatus(bool connected, string agentId, string tenantId, DateTime? lastHeartbeat)
    {
        try
        {
            Directory.CreateDirectory(StatusDir);
            var status = new
            {
                connected,
                agentVersion = GetVersion(),
                agentId,
                tenantId,
                lastHeartbeat = lastHeartbeat?.ToString("o"),
                hostname = Environment.MachineName,
                pid = Environment.ProcessId,
                updatedAt = DateTime.UtcNow.ToString("o"),
            };
            File.WriteAllText(StatusPath, JsonSerializer.Serialize(status, new JsonSerializerOptions { WriteIndented = true }));
        }
        catch { /* Don't crash the service for status file issues */ }
    }
}
