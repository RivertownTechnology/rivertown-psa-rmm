using Rivertown.Agent.Core;
using Rivertown.Agent.Core.Communication;
using Rivertown.Agent.Core.Handlers;

var builder = Host.CreateDefaultBuilder(args)
    .UseWindowsService(options => options.ServiceName = "RivertownRMMAgent")
    .ConfigureServices(services =>
    {
        services.AddHostedService<AgentService>();
    });

var host = builder.Build();
await host.RunAsync();
