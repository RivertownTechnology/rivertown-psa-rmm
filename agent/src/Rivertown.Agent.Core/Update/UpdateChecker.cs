using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json;

namespace Rivertown.Agent.Core.Update;

public class UpdateCheckResult
{
    public string LatestVersion { get; set; } = "";
    public string CurrentVersion { get; set; } = "";
    public bool UpdateAvailable { get; set; }
    public string DownloadUrl { get; set; } = "";
    public string Sha256 { get; set; } = "";
    public string ReleaseNotes { get; set; } = "";
    public bool Mandatory { get; set; }
}

public class UpdateChecker
{
    private readonly ILogger<UpdateChecker> _logger;
    private readonly string _apiBaseUrl;
    private readonly string _currentVersion;
    private static readonly HttpClient _http = new() { Timeout = TimeSpan.FromMinutes(5) };

    public UpdateChecker(ILogger<UpdateChecker> logger, string apiBaseUrl)
    {
        _logger = logger;
        _apiBaseUrl = apiBaseUrl.TrimEnd('/');
        _currentVersion = AgentStatusWriter.GetVersion();
    }

    public async Task<UpdateCheckResult?> CheckForUpdateAsync()
    {
        try
        {
            var url = $"{_apiBaseUrl}/api/v1/rmm/agent/version?current={_currentVersion}&platform=win-x64";
            _logger.LogInformation("Checking for updates at {Url}", url);

            var res = await _http.GetAsync(url);
            if (!res.IsSuccessStatusCode)
            {
                _logger.LogWarning("Update check failed: {Status}", res.StatusCode);
                return null;
            }

            var result = await res.Content.ReadFromJsonAsync<UpdateCheckResult>();
            if (result?.UpdateAvailable == true)
            {
                _logger.LogInformation("Update available: {Current} → {Latest}", _currentVersion, result.LatestVersion);
            }
            else
            {
                _logger.LogDebug("Agent is up to date ({Version})", _currentVersion);
            }
            return result;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Update check failed");
            return null;
        }
    }

    public async Task<bool> DownloadUpdateAsync(UpdateCheckResult update)
    {
        var updatesDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
            "Rivertown", "Agent", "updates"
        );
        Directory.CreateDirectory(updatesDir);

        var downloadPath = Path.Combine(updatesDir, "Rivertown.Agent.Core.exe.new");
        var manifestPath = Path.Combine(updatesDir, "update-pending.json");

        try
        {
            _logger.LogInformation("Downloading update v{Version}...", update.LatestVersion);
            var downloadUrl = update.DownloadUrl.StartsWith("http")
                ? update.DownloadUrl
                : $"{_apiBaseUrl}{update.DownloadUrl}";

            using var response = await _http.GetAsync(downloadUrl, HttpCompletionOption.ResponseHeadersRead);
            response.EnsureSuccessStatusCode();

            await using var fileStream = File.Create(downloadPath);
            await response.Content.CopyToAsync(fileStream);
            await fileStream.FlushAsync();
            fileStream.Close();

            // Verify SHA-256 if provided
            if (!string.IsNullOrEmpty(update.Sha256))
            {
                var hash = await ComputeSha256Async(downloadPath);
                if (!string.Equals(hash, update.Sha256, StringComparison.OrdinalIgnoreCase))
                {
                    _logger.LogError("SHA-256 mismatch! Expected {Expected}, got {Actual}", update.Sha256, hash);
                    File.Delete(downloadPath);
                    return false;
                }
            }

            // Write manifest
            var manifest = new
            {
                version = update.LatestVersion,
                stagedFile = "Rivertown.Agent.Core.exe.new",
                sha256 = update.Sha256,
                stagedAt = DateTime.UtcNow.ToString("o"),
            };
            File.WriteAllText(manifestPath, JsonSerializer.Serialize(manifest, new JsonSerializerOptions { WriteIndented = true }));

            _logger.LogInformation("Update v{Version} downloaded and verified", update.LatestVersion);
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to download update");
            if (File.Exists(downloadPath)) File.Delete(downloadPath);
            return false;
        }
    }

    public void LaunchUpdaterAndStop(IHostApplicationLifetime lifetime)
    {
        var installDir = Path.GetDirectoryName(Environment.ProcessPath) ?? @"C:\Program Files\Rivertown\Agent";
        var updaterPath = Path.Combine(installDir, "RivertownUpdater.exe");

        if (!File.Exists(updaterPath))
        {
            _logger.LogError("Updater not found at {Path}", updaterPath);
            return;
        }

        _logger.LogInformation("Launching updater and stopping service...");
        System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
        {
            FileName = updaterPath,
            Arguments = "--service RivertownRMMAgent",
            UseShellExecute = false,
            CreateNoWindow = true,
        });

        // Stop the service so the updater can replace the binary
        lifetime.StopApplication();
    }

    public async Task CheckAndApplyUpdateAsync(IHostApplicationLifetime lifetime, string? targetVersion = null)
    {
        var result = await CheckForUpdateAsync();
        if (result == null || !result.UpdateAvailable) return;
        if (targetVersion != null && result.LatestVersion != targetVersion) return;

        var downloaded = await DownloadUpdateAsync(result);
        if (downloaded)
        {
            LaunchUpdaterAndStop(lifetime);
        }
    }

    private static async Task<string> ComputeSha256Async(string filePath)
    {
        using var sha = SHA256.Create();
        await using var stream = File.OpenRead(filePath);
        var hash = await sha.ComputeHashAsync(stream);
        return Convert.ToHexString(hash).ToLowerInvariant();
    }
}
