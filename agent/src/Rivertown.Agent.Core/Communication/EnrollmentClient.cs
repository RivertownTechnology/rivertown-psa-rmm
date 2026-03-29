using System.Net.Http.Json;
using System.Text.Json;
using Rivertown.Agent.Core.Configuration;
using Rivertown.Agent.Core.Inventory;

namespace Rivertown.Agent.Core.Communication;

public class EnrollmentClient
{
    private readonly ILogger<EnrollmentClient> _logger;

    public EnrollmentClient(ILogger<EnrollmentClient> logger)
    {
        _logger = logger;
    }

    public async Task<bool> EnrollAsync(AgentConfig config)
    {
        if (config.IsEnrolled && !string.IsNullOrEmpty(config.AgentId))
        {
            _logger.LogInformation("Agent already enrolled as {AgentId}", config.AgentId);
            return true;
        }

        if (string.IsNullOrEmpty(config.EnrollmentToken))
        {
            _logger.LogError("No enrollment token configured. Cannot enroll.");
            return false;
        }

        _logger.LogInformation("Enrolling with API at {ApiUrl}...", config.ApiBaseUrl);

        using var http = new HttpClient();
        var machineId = GetMachineId();
        var hostname = Environment.MachineName;
        var sysInfo = SystemInfoCollector.CollectHardwareInfo();

        var payload = new
        {
            enrollmentToken = config.EnrollmentToken,
            machineId,
            hostname,
            osInfo = new
            {
                osName = sysInfo.GetValueOrDefault("osName", ""),
                osVersion = sysInfo.GetValueOrDefault("osVersion", ""),
                manufacturer = sysInfo.GetValueOrDefault("manufacturer", ""),
                model = sysInfo.GetValueOrDefault("model", ""),
                processor = sysInfo.GetValueOrDefault("processor", ""),
                serialNumber = sysInfo.GetValueOrDefault("serialNumber", ""),
            }
        };

        try
        {
            var response = await http.PostAsJsonAsync($"{config.ApiBaseUrl}/api/v1/rmm/enroll", payload);

            if (!response.IsSuccessStatusCode)
            {
                var error = await response.Content.ReadAsStringAsync();
                _logger.LogError("Enrollment failed: {StatusCode} - {Error}", response.StatusCode, error);
                return false;
            }

            var result = await response.Content.ReadFromJsonAsync<JsonElement>();
            config.AgentId = result.GetProperty("agentId").GetString() ?? "";
            config.TenantId = result.GetProperty("tenantId").GetString() ?? "";
            config.CustomerId = result.GetProperty("customerId").GetString() ?? "";
            config.IsEnrolled = true;
            config.Save();

            _logger.LogInformation("Enrolled successfully! AgentId={AgentId}, TenantId={TenantId}",
                config.AgentId, config.TenantId);
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Enrollment request failed");
            return false;
        }
    }

    private static string GetMachineId()
    {
        try
        {
            using var searcher = new System.Management.ManagementObjectSearcher("SELECT SerialNumber FROM Win32_BIOS");
            foreach (var obj in searcher.Get())
            {
                var serial = obj["SerialNumber"]?.ToString();
                if (!string.IsNullOrEmpty(serial)) return serial;
            }
        }
        catch { }
        return Environment.MachineName;
    }
}
