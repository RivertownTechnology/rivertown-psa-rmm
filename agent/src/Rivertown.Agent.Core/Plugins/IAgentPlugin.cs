namespace Rivertown.Agent.Core.Plugins;

public interface IAgentPlugin
{
    string Name { get; }
    string Version { get; }
    string[] HandledCommandTypes { get; }
    Task InitializeAsync(IPluginContext context);
    Task<CommandResponse> HandleCommandAsync(AgentCommand command);
    Task ShutdownAsync();
}

public interface IPluginContext
{
    ILogger Logger { get; }
    string DataDirectory { get; }
}

public record AgentCommand
{
    public string CommandId { get; init; } = "";
    public string Type { get; init; } = "";
    public Dictionary<string, object> Payload { get; init; } = new();
    public DateTime IssuedAt { get; init; }
    public DateTime? ExpiresAt { get; init; }
}

public record CommandResponse
{
    public string CommandId { get; init; } = "";
    public string Status { get; init; } = "success"; // success, error, in_progress
    public Dictionary<string, object> Payload { get; init; } = new();
    public DateTime CompletedAt { get; init; }
}
