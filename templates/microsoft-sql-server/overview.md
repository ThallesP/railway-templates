# Deploy and Host Microsoft SQL Server on Railway

Microsoft SQL Server (MSSQL) is Microsoft's relational database, the one behind many .NET, ERP and reporting workloads, with T-SQL, SQL Server Management Studio and Azure Data Studio as its tooling. This template runs the official Linux container image on Railway with persistent storage, lets you choose the version and edition at deploy time, and generates a compliant `sa` password.

## About Hosting Microsoft SQL Server

Railway cannot pull directly from Microsoft's container registry, so the template builds a one-line Dockerfile that wraps `mcr.microsoft.com/mssql/server`. `MSSQL_VERSION` (`2025`, `2022` or `2019`) selects the image tag, `MSSQL_PID` selects the edition or license, and `ACCEPT_EULA` records your acceptance of Microsoft's [SQL Server license terms](https://go.microsoft.com/fwlink/?linkid=857698); the container will not start without it. Data lives on a Railway volume at `/var/opt/mssql`, and the service runs as root so SQL Server can write to the volume.

`MSSQL_SA_PASSWORD` is generated with a mix of upper case, lower case, digits and a symbol to satisfy SQL Server's complexity rules; `SA_PASSWORD` mirrors it for tools that still read the old name.

## Common Use Cases

- A development or staging database for .NET, Entity Framework or legacy applications that require SQL Server
- Running a licensed Standard or Enterprise instance you already own, on usage-based hosting instead of a fixed VM
- A disposable SQL Server for CI, migrations testing or training, deleted when done
- Hosting a small production database on the Express or Developer edition where its limits are acceptable

## Dependencies for Microsoft SQL Server Hosting

- `mcr.microsoft.com/mssql/server:<version>-latest`, built from the template repository
- A Railway volume at `/var/opt/mssql`

### Deployment Dependencies

- [Run SQL Server in a Docker container](https://learn.microsoft.com/en-us/sql/linux/quickstart-install-connect-docker)
- [Configure SQL Server container environment variables](https://learn.microsoft.com/en-us/sql/linux/sql-server-linux-docker-container-configure)
- [Template repository](https://github.com/ThallesP/microsoft-sql-server)
- [Railway TCP proxy](https://docs.railway.com/networking/tcp-proxy)

### Implementation Details

```
ACCEPT_EULA=Y                  # required
MSSQL_PID=Developer            # Evaluation, Developer, Express, Web, Standard, Enterprise, EnterpriseCore or a product key
MSSQL_VERSION=2025             # 2025, 2022 or 2019
MSSQL_SA_PASSWORD=<generated>
RAILWAY_RUN_UID=0
```

SQL Server listens on port 1433. Services in the same Railway project connect to `<service private domain>,1433` over the private network. To connect from your laptop or an external app, add a TCP proxy for port 1433 in the service's Networking settings; Railway then gives you a public host and port to use in SSMS or Azure Data Studio as `host,port` with SQL Server authentication and the `sa` user.

## Why Deploy Microsoft SQL Server on Railway?

SQL Server is usually the one component of a stack that still lives on a Windows VM or a managed cloud SKU with a fixed monthly price. Here it is a container billed by the second, with a volume for the data, the version pinned by a variable, and the rest of your services one private hostname away.

## Frequently Asked Questions

### Which edition should I pick?

`Developer` is free and full featured but licensed for non-production use only. `Express` is free for production with limits on database size, memory and CPU. `Standard` and `Enterprise` require a license you own; `MSSQL_PID` also accepts a product key. Microsoft's licensing terms apply regardless of where the container runs.

### How do I connect from SQL Server Management Studio?

Add a TCP proxy on port 1433, then use the proxy domain and port from the service variables as the server name, written `domain,port` with a comma. Authentication: SQL Server, login `sa`, password `MSSQL_SA_PASSWORD`.

### Can I change the version after deploying?

Change `MSSQL_VERSION` and redeploy to rebuild on another tag. Moving a data directory to an older SQL Server version is not supported by Microsoft, so only go up.

### How much memory does it need?

SQL Server is memory hungry; give the service at least 2 GB and expect it to use what it is given. Railway bills the RAM actually used at $10 per GB per month, so an idle 2 GB instance is roughly $20 a month.

### Does the data survive redeploys?

Yes, it is on the volume at `/var/opt/mssql`. Take regular backups with `BACKUP DATABASE` to the volume and copy them out, or use the bucket integration of your choice; the volume itself is not a backup.
