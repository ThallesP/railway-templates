# Deploy and Host ASP.NET Minimal API on Railway

A minimal API is the smallest ASP.NET Core application there is: a `Program.cs` that maps routes to functions, no controllers, no startup class. This template deploys one on .NET 9 with a multi-stage Dockerfile and three endpoints, so you have a working C# HTTP service on Railway to build from in a couple of minutes.

## About Hosting ASP.NET Minimal API

The service builds from a small repository with the included Dockerfile: the .NET 9 SDK image restores and publishes the project, and the runtime image (`mcr.microsoft.com/dotnet/aspnet:9.0`) runs the published DLL. The ASP.NET Core runtime image listens on port 8080 by default, so after deploying, generate a domain for the service and set the target port to 8080 to reach it.

`Program.cs` is the whole application:

```csharp
var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

app.MapGet("/", () => "Hello World!");
app.MapGet("/json", () => Results.Json(new { message = "Hello World!" }));
app.MapGet("/json/{name}", (string name) => Results.Json(new { message = $"Hello {name}!" }));

app.Run();
```

## Common Use Cases

- A starting point for a C# backend or microservice on Railway, with the Dockerfile already correct
- A reference for teams moving .NET apps off Windows hosting to Linux containers
- A health endpoint or webhook receiver that needs to exist in five minutes
- Trying .NET on Railway before committing a larger project

## Dependencies for ASP.NET Minimal API Hosting

- .NET 9 SDK and ASP.NET Core 9 runtime images from Microsoft
- The template repository, deployed from GitHub

### Deployment Dependencies

- [ASP.NET Core minimal APIs overview](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/minimal-apis)
- [Template repository](https://github.com/ThallesP/ASP.NET-Minimal-API)
- [Railway public networking](https://docs.railway.com/networking/public-networking)

### Implementation Details

Eject the service from the template repository in its settings to get your own copy on GitHub, then add endpoints, packages and configuration as you would in any ASP.NET Core project. Railway rebuilds on every push to the default branch. Configuration values go in service variables and are read with the standard `builder.Configuration` providers.

## Why Deploy ASP.NET Minimal API on Railway?

The Dockerfile build means Railway runs exactly what you run locally with `docker build`, with no platform-specific buildpack to learn. Variables, domains, private networking to a PostgreSQL or Redis service, and deploy-on-push all work the same for .NET as for any other language.

## Frequently Asked Questions

### The deploy is green but the domain shows nothing.

Generate a domain in the service's Networking settings and set the port to 8080, the default for the ASP.NET Core 8+ runtime images. Alternatively set `ASPNETCORE_HTTP_PORTS` to the port Railway assigns in `PORT`.

### How do I add a database?

Add a PostgreSQL service to the project, reference its `DATABASE_URL` in a variable on this service, and read it from configuration. Connections over the private network are free of egress charges.

### Which .NET version is this?

.NET 9. Change the two image tags in the Dockerfile and the `TargetFramework` in the project file to move to another version.

### How much does it cost?

A minimal API idles around 0.1 GB of RAM, so it runs inside the Hobby plan's included usage.

### Can I use controllers or Blazor instead?

Yes. This is a normal ASP.NET Core project; add controllers, Razor pages or Blazor as you would anywhere. The Dockerfile does not need to change.
