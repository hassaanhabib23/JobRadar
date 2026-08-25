# Coolify server unreachable — blocks JobRadar deployment

**Status:** Open — blocks any new deployment (JobRadar included) to this server
**Date raised:** 2026-08-25
**Affected server:** `public-lxc` (Coolify server UUID `wzo1rffuev2ettz5b444126g`)
**Team / Project:** Coolify team "Public" (id 2) → project "public" (uuid `7498936687d6972dd80d0884`) → environment "production"

## Summary

JobRadar cannot be deployed to Coolify because Coolify's control plane cannot
establish an SSH connection to the target server. This is a network
reachability problem between Coolify and the server, not a Coolify
configuration, permissions, or application problem.

## Environment details

| Field | Value |
|---|---|
| Coolify instance | `https://coolify.mylogiclab.cloud` |
| Server name | `public-lxc` |
| Server description | "Isolated LXC container" |
| Server IP | `10.201.0.10` (private / RFC1918 address) |
| SSH port | `22` |
| SSH user | `root` |
| `is_reachable` | `false` |
| `is_usable` | `false` |
| `unreachable_count` | 3612 at time of writing, incrementing on every health check |
| Existing resource on this server | `lodgelogic` (service), status `running:unknown` |

## Root cause

The server's registered IP, `10.201.0.10`, is a **private address**. Coolify's
control plane runs on `coolify.mylogiclab.cloud` (public internet) and has no
network route to `10.201.0.10` — so every SSH attempt to port 22 on that host
fails. This has been failing consistently, not intermittently (see evidence
below).

## Evidence gathered

1. **Live re-validation, not a stale flag.** Triggered Coolify's own
   connection check via its API:

   ```
   POST /api/v1/servers/wzo1rffuev2ettz5b444126g/validate
   → 201 {"message":"Validation started."}
   ```

   Polling the server afterward showed `is_reachable` still `false` and
   `unreachable_count` incremented (3611 → 3612), confirming the check ran
   again and failed live, moments before this report.

2. **Direct TCP test from an independent machine** (not Coolify) to
   `10.201.0.10:22` — connection hung with no response (timed out), i.e. no
   route to host. This rules out "it's just Coolify's key/config" — nothing
   outside the container's own network can reach it on port 22.

3. **The existing `lodgelogic` app on the same server shows
   `running:unknown`.** This is expected, not contradictory: Docker keeps
   already-started containers running independently of Coolify's control
   connection (data plane), but Coolify can no longer confirm health or
   manage that server (control plane) because SSH is down. An app already
   running does not prove the server is deployable-to — new deploys, rebuilds,
   and redeploys all require a fresh SSH session, which currently fails.

## Impact

- **JobRadar cannot be deployed** to this server via Coolify until SSH
  connectivity is restored.
- Any **redeploy or config change to the existing `lodgelogic` app** on this
  server is also blocked for the same reason, even though its current
  containers keep running.
- Coolify cannot report accurate health for anything on this server.

## What needs to happen

Someone with direct access to the physical host / hypervisor / provider
console for the LXC container at `10.201.0.10` needs to determine why it is
not reachable from `coolify.mylogiclab.cloud`, e.g.:

- Confirm the container's current private IP hasn't changed (LXC/LXD
  containers can get a new DHCP lease after a restart).
- Confirm there is an actual network path (VPN, WireGuard/Tailscale tunnel,
  routed subnet, or NAT/port-forward) between Coolify's host and this
  private address — a bare `10.x.x.x` address is not reachable from the
  public internet by design.
- If a tunnel/VPN exists, confirm it's currently up.
- Confirm SSH (port 22) is listening and not firewalled on the container
  itself.
- If the container was rebuilt/recreated, Coolify's stored SSH key (server
  `private_key_id: 1` in Coolify) may need to be re-added to
  `~/.ssh/authorized_keys` for `root` on the container.

Once connectivity is restored, re-run validation from Coolify (Server →
"Validate server" in the UI, or `POST /api/v1/servers/{uuid}/validate` via
the API) to confirm `is_reachable`/`is_usable` flip to `true` before
attempting the JobRadar deploy.

## Open questions for the infra owner

- Who manages this LXC container / its host, and do they have console access
  outside of Coolify (e.g. `lxc exec`, provider dashboard)?
- Was this server ever reachable from Coolify, or has it been broken since
  it was first registered (created 2026-07-23)?
- Is there a reason this server is on a private/isolated network rather than
  one Coolify's control plane can reach — should JobRadar instead target a
  different, already-reachable Coolify server?
