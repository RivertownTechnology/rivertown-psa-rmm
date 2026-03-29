using System.ServiceProcess;
using System.Text.Json;

/// <summary>
/// Rivertown Agent Updater — stops the service, swaps the binary, restarts it.
/// Launched by the agent before it stops itself for an update.
/// Usage: RivertownUpdater.exe --service RivertownRMMAgent
/// </summary>

var serviceName = "RivertownRMMAgent";
var logDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "Rivertown", "Agent", "logs");
var updatesDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "Rivertown", "Agent", "updates");
var installDir = @"C:\Program Files\Rivertown\Agent";

Directory.CreateDirectory(logDir);

// Parse args
for (int i = 0; i < args.Length; i++)
{
    if (args[i] == "--service" && i + 1 < args.Length) serviceName = args[i + 1];
    if (args[i] == "--install-dir" && i + 1 < args.Length) installDir = args[i + 1];
}

void Log(string msg)
{
    var line = $"[{DateTime.UtcNow:yyyy-MM-dd HH:mm:ss}] {msg}";
    Console.WriteLine(line);
    try { File.AppendAllText(Path.Combine(logDir, "update.log"), line + Environment.NewLine); } catch { }
}

try
{
    Log($"Updater started. Service: {serviceName}");

    // Read manifest
    var manifestPath = Path.Combine(updatesDir, "update-pending.json");
    if (!File.Exists(manifestPath))
    {
        Log("ERROR: No update-pending.json found. Aborting.");
        return 1;
    }
    var manifest = JsonSerializer.Deserialize<JsonElement>(File.ReadAllText(manifestPath));
    var version = manifest.GetProperty("version").GetString() ?? "unknown";
    var stagedFile = manifest.GetProperty("stagedFile").GetString() ?? "Rivertown.Agent.Core.exe.new";
    Log($"Updating to version {version}");

    var newBinaryPath = Path.Combine(updatesDir, stagedFile);
    if (!File.Exists(newBinaryPath))
    {
        Log($"ERROR: Staged file not found: {newBinaryPath}");
        return 1;
    }

    // Wait for service to stop
    Log("Waiting for service to stop...");
    using var sc = new ServiceController(serviceName);
    var waited = 0;
    while (sc.Status != ServiceControllerStatus.Stopped && waited < 30)
    {
        Thread.Sleep(1000);
        sc.Refresh();
        waited++;
    }

    if (sc.Status != ServiceControllerStatus.Stopped)
    {
        Log("Service did not stop gracefully. Force stopping...");
        try { sc.Stop(); sc.WaitForStatus(ServiceControllerStatus.Stopped, TimeSpan.FromSeconds(15)); }
        catch (Exception ex) { Log($"Force stop failed: {ex.Message}"); }
    }

    Log("Service stopped. Swapping binaries...");

    // Swap the service binary
    var currentBinary = Path.Combine(installDir, "Rivertown.Agent.Core.exe");
    var backupBinary = Path.Combine(installDir, "Rivertown.Agent.Core.exe.old");

    if (File.Exists(currentBinary))
    {
        if (File.Exists(backupBinary)) File.Delete(backupBinary);
        File.Move(currentBinary, backupBinary);
        Log("Backed up current binary to .old");
    }

    File.Move(newBinaryPath, currentBinary);
    Log("New binary installed");

    // Also swap the tray app if a new one is staged
    var newTrayPath = Path.Combine(updatesDir, "Rivertown.Agent.Tray.exe.new");
    if (File.Exists(newTrayPath))
    {
        var currentTray = Path.Combine(installDir, "Rivertown.Agent.Tray.exe");
        var backupTray = Path.Combine(installDir, "Rivertown.Agent.Tray.exe.old");
        if (File.Exists(currentTray))
        {
            if (File.Exists(backupTray)) File.Delete(backupTray);
            File.Move(currentTray, backupTray);
        }
        File.Move(newTrayPath, currentTray);
        Log("Tray app updated");
    }

    // Start the service
    Log("Starting service...");
    sc.Refresh();
    sc.Start();
    sc.WaitForStatus(ServiceControllerStatus.Running, TimeSpan.FromSeconds(30));
    Log("Service started successfully");

    // Verify it's running
    Thread.Sleep(3000);
    sc.Refresh();
    if (sc.Status == ServiceControllerStatus.Running)
    {
        Log($"Update to v{version} completed successfully!");
        // Clean up
        if (File.Exists(backupBinary)) try { File.Delete(backupBinary); } catch { }
        if (File.Exists(manifestPath)) File.Delete(manifestPath);
    }
    else
    {
        Log($"WARNING: Service status is {sc.Status} after start. Rolling back...");
        // Rollback
        if (File.Exists(backupBinary))
        {
            if (File.Exists(currentBinary)) File.Delete(currentBinary);
            File.Move(backupBinary, currentBinary);
            sc.Start();
            Log("Rolled back to previous version");
        }
        return 1;
    }

    return 0;
}
catch (Exception ex)
{
    Log($"FATAL: {ex}");
    return 1;
}
