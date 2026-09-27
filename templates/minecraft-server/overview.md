# Deploy and Host Minecraft Server on Railway

A Java Edition Minecraft server running Paper through the widely used `itzg/minecraft-server` image, plus a small web dashboard built for this template: a live console, a file browser for the world and plugins, and a server status view, all behind a Railway login. Players connect through a public TCP address; the world lives on a persistent volume.

## About Hosting Minecraft Server

The template is a single service. Its Dockerfile starts from `itzg/minecraft-server`, which downloads the requested server type and version on boot (Paper by default), runs it on Java 21 with Aikar's JVM flags, and keeps the world under `/data`, where the Railway volume is mounted. Alongside the game server the container runs the dashboard on a separate port, exposed on the service's public HTTPS domain. Players do not use that domain; they connect to the TCP proxy address Railway assigns to port 25565, which you will find as `RAILWAY_TCP_PROXY_DOMAIN` and `RAILWAY_TCP_PROXY_PORT` in the service variables.

The dashboard signs you in with your Railway account and only admits people who can see this service in the Railway project, so there is no separate admin password to manage. From it you can run console commands, tail the log, upload plugins and edit configuration files.

The one thing you must do at deploy time is set `EULA` to `TRUE`, which records your agreement to the [Minecraft End User License Agreement](https://aka.ms/MinecraftEULA). The server refuses to start with any other value.

## Common Use Cases

- A private survival or creative server for friends, running 24/7 without anyone's PC being on
- A Paper server with plugins for a small community, managed from the browser instead of over SSH
- A temporary event server: deploy, play, delete the project, keep the world by downloading it from the file browser first
- A test server for plugin development, with the console and logs one click away

## Dependencies for Minecraft Server Hosting

- `itzg/minecraft-server` (Paper, Java 21) as the base image
- A Railway volume mounted at `/data` for the world, plugins and configuration
- A TCP proxy on port 25565 for players and a public domain for the dashboard

### Deployment Dependencies

- [itzg/minecraft-server documentation](https://docker-minecraft-server.readthedocs.io/en/latest/)
- [Server types: Paper](https://docker-minecraft-server.readthedocs.io/en/latest/types-and-platforms/server-types/paper/)
- [Dashboard source on GitHub](https://github.com/ThallesP/railway-minecraft-template)
- [Railway TCP proxy](https://docs.railway.com/networking/tcp-proxy)

### Implementation Details

Variables worth knowing:

```
EULA=TRUE                      # required, your acceptance of the Minecraft EULA
TYPE=PAPER                     # any type the itzg image supports (VANILLA, FABRIC, FORGE, ...)
MAX_MEMORY=8G                  # JVM heap ceiling, lower it on small plans
USE_AIKAR_FLAGS=true
ENABLE_AUTOPAUSE=true          # pause the JVM when nobody is online
MOTD=                          # optional server list message
```

`VERSION` follows the image default (latest release) unless you set it. `EXISTING_OPS_FILE=SYNCHRONIZE` keeps your `ops.json` in sync with the `OPS` variable, and `ENABLE_ROLLING_LOGS=true` stops the log directory from growing forever.

## Why Deploy Minecraft Server on Railway?

You pay for the memory and CPU the server actually uses, per second, instead of renting a fixed slot. The volume keeps the world across redeploys and version changes, the TCP proxy gives players a stable address, and the dashboard removes the need for SSH or a separate panel container. Autopause lowers usage while nobody is online.

## Frequently Asked Questions

### The server starts and stops right away. What is wrong?

Two causes account for nearly every failed deploy of this template. First, `EULA` must be exactly `TRUE`; the server exits otherwise. Second, memory: the Trial plan allows 1 GB of RAM per service, and a modern Paper server does not fit in that. On the Hobby plan or above, raise the service's memory limit if you see the JVM being killed, and set `MAX_MEMORY` below the plan limit so the heap cannot exceed what Railway allows.

### How do players connect?

Give them `RAILWAY_TCP_PROXY_DOMAIN:RAILWAY_TCP_PROXY_PORT` from the service variables, for example `roundhouse.proxy.rlwy.net:11105`. The public HTTPS domain is for the dashboard only.

### Does this work for Bedrock Edition?

No. Bedrock uses UDP, and Railway's TCP proxy carries TCP only. This template is Java Edition.

### How do I add plugins or change server.properties?

Open the dashboard, browse to `/data/plugins` and upload the jar, or edit `server.properties` in place, then restart the server from the console. The itzg image also supports listing plugin downloads in variables; see its documentation.

### How much RAM should I give it?

Paper runs comfortably for a few players at 2 to 4 GB. `MAX_MEMORY` defaults to 8G; on Railway the service memory limit is what you actually pay for, so set the two consistently. Idle usage drops when autopause is on.

### Is the world safe if I redeploy?

Yes. The world, plugins and configuration are on the volume at `/data`. Deleting the volume or the service deletes the world, so download a backup from the file browser before you do either.
