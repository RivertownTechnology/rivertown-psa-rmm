using System.Text.Json;

namespace Rivertown.Agent.Core.Configuration;

public class AgentConfig
{
    public string AgentId { get; set; } = "";
    public string TenantId { get; set; } = "";
    public string CustomerId { get; set; } = "";
    public string MqttBrokerUrl { get; set; } = "localhost";
    public int MqttBrokerPort { get; set; } = 1883;
    public string ApiBaseUrl { get; set; } = "http://localhost:3000";
    public string EnrollmentToken { get; set; } = "";
    public bool IsEnrolled { get; set; } = false;

    private static readonly string ConfigDir = Path.Combine(
        // Use ProgramData if running as service/admin, fall back to AppData for dev/testing
        HasWriteAccess(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "Rivertown", "Agent"))
            ? Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData)
            : Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "Rivertown", "Agent"
    );

    private static bool HasWriteAccess(string path)
    {
        try { Directory.CreateDirectory(path); File.WriteAllText(Path.Combine(path, ".test"), ""); File.Delete(Path.Combine(path, ".test")); return true; }
        catch { return false; }
    }
    private static readonly string ConfigPath = Path.Combine(ConfigDir, "agent-config.json");

    public static AgentConfig Load()
    {
        if (!File.Exists(ConfigPath))
            return new AgentConfig();

        var json = File.ReadAllText(ConfigPath);
        return JsonSerializer.Deserialize<AgentConfig>(json) ?? new AgentConfig();
    }

    public void Save()
    {
        Directory.CreateDirectory(ConfigDir);
        var json = JsonSerializer.Serialize(this, new JsonSerializerOptions { WriteIndented = true });
        File.WriteAllText(ConfigPath, json);
    }
}
