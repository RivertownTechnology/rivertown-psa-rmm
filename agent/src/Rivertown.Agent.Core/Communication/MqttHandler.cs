using System.Text;
using System.Text.Json;
using MQTTnet;
using MQTTnet.Client;

namespace Rivertown.Agent.Core.Communication;

public class MqttHandler : IDisposable
{
    private readonly IMqttClient _client;
    private readonly ILogger<MqttHandler> _logger;
    private string _tenantId = "";
    private string _agentId = "";

    public event Func<string, string, Task>? OnCommandReceived; // commandType, payloadJson

    public MqttHandler(ILogger<MqttHandler> logger)
    {
        _logger = logger;
        var factory = new MqttFactory();
        _client = factory.CreateMqttClient();

        _client.ApplicationMessageReceivedAsync += async e =>
        {
            var topic = e.ApplicationMessage.Topic;
            var payload = Encoding.UTF8.GetString(e.ApplicationMessage.PayloadSegment);

            if (topic.EndsWith("/command") && OnCommandReceived != null)
            {
                try
                {
                    using var doc = JsonDocument.Parse(payload);
                    var type = doc.RootElement.GetProperty("type").GetString() ?? "";
                    await OnCommandReceived(type, payload);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Failed to process command");
                }
            }
        };
    }

    public async Task ConnectAsync(string host, int port, string tenantId, string agentId)
    {
        _tenantId = tenantId;
        _agentId = agentId;

        var options = new MqttClientOptionsBuilder()
            .WithTcpServer(host, port)
            .WithClientId($"rivertown-agent-{agentId}")
            .WithCleanSession(true)
            .Build();

        _logger.LogInformation("Connecting to MQTT broker at {Host}:{Port}...", host, port);

        _client.DisconnectedAsync += async e =>
        {
            _logger.LogWarning("MQTT disconnected. Reconnecting in 5 seconds...");
            await Task.Delay(5000);
            try { await _client.ConnectAsync(options); }
            catch (Exception ex) { _logger.LogError(ex, "Reconnect failed"); }
        };

        await _client.ConnectAsync(options);
        _logger.LogInformation("MQTT connected");

        // Subscribe to command topic
        var commandTopic = $"rivertown/{_tenantId}/{_agentId}/command";
        await _client.SubscribeAsync(commandTopic);
        _logger.LogInformation("Subscribed to {Topic}", commandTopic);
    }

    public async Task PublishHeartbeatAsync(object heartbeatData)
    {
        if (!_client.IsConnected) return;
        var topic = $"rivertown/{_tenantId}/{_agentId}/heartbeat";
        var payload = JsonSerializer.Serialize(heartbeatData);
        await _client.PublishStringAsync(topic, payload);
    }

    public async Task PublishResponseAsync(object responseData)
    {
        if (!_client.IsConnected) return;
        var topic = $"rivertown/{_tenantId}/{_agentId}/response";
        var payload = JsonSerializer.Serialize(responseData);
        var msg = new MqttApplicationMessageBuilder()
            .WithTopic(topic)
            .WithPayload(payload)
            .WithQualityOfServiceLevel(MQTTnet.Protocol.MqttQualityOfServiceLevel.AtLeastOnce)
            .Build();
        await _client.PublishAsync(msg);
    }

    public async Task PublishRawAsync(string topic, string payload)
    {
        if (!_client.IsConnected) return;
        await _client.PublishStringAsync(topic, payload);
    }

    public bool IsConnected => _client.IsConnected;

    public void Dispose()
    {
        _client?.Dispose();
    }
}
