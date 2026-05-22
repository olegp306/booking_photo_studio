# /opt/apps Port Registry

Last reviewed: 2026-05-22

| Site | App path | Public route | Internal web/API port | Database host port | systemd units | Compose project |
| --- | --- | --- | --- | --- | --- | --- |
| crm-staging | `/opt/apps/crm-staging` | `http://204.168.163.99:3002/` via Caddy; root catch-all also configured on `:80` | `3001` | `15432` | `crm-staging-web.service`, `crm-staging-telegram.service`, `caddy.service` | `crm_staging` |
| photo-studio-marketplace | `/opt/apps/photo-studio-marketplace` | `http://204.168.163.99:3003/`; prefix route also available at `http://204.168.163.99/photo-studio-marketplace/` | `4003` | `15433` | `photo-studio-marketplace-api.service`, `caddy.service` | `photo_studio_marketplace` |

Rules:

- Bind app and database ports to `127.0.0.1` unless a short-lived direct public test is explicitly planned.
- Public traffic should go through Caddy. Keep project routes prefix-scoped when sharing an IP without domains.
- Allocate new internal web/API ports upward from `4004`.
- Allocate new database host ports upward from `15434`.
- Use one unique compose project name per site.
- Store deployed apps only under `/opt/apps`.
