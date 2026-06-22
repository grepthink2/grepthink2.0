# deploy/ — VM2 native deployment artifacts

Files here support running GrepThink 2.0 on VM2 (`2262-cse115b-02.be.ucsc.edu`)
as a native systemd service behind the shared nginx, **and** dialing its
resource use down while zeus faults-lab load-gen experiments run.

| File | Purpose |
|------|---------|
| `grepthink-api.service` | systemd unit for the FastAPI/uvicorn backend on `127.0.0.1:5001`, with production worker count and cgroup-v2 resource limits baked in. |
| `experiment-mode` | `on`/`off`/`status` toggle that hard-throttles the web tier (GrepThink + slug-mcp) so zeus owns the box during a run. |

> Scope note: this is the **resource-control** slice of the deploy. The
> nginx site patch, `.env`, `deploy.sh`, and CI are tracked separately in the
> deployment runbook — not added here yet.

## Resource model (two layers)

**Layer 1 — always on (in `grepthink-api.service`):** `CPUWeight=20`,
`IOWeight=20` are *relative* and only matter under contention, so while zeus
saturates the box the API yields (~5:1 to zeus's default weight of 100), but
at idle it runs full speed. `MemoryHigh=512M` / `MemoryMax=768M` bound memory
(this box has **no swap**). No manual step needed — it self-balances.

**Layer 2 — `experiment-mode` toggle (CPU only, live, reversible):** for a
*measured* run, pin the web tier to one core so zeus gets clean, dedicated
cores — the gold standard for load-gen fidelity. Applied with
`systemctl set-property --runtime` (no restart; auto-clears on reboot).

## Install (one-time, on VM2)

```bash
sudo cp deploy/grepthink-api.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now grepthink-api
sudo install -m 0755 deploy/experiment-mode /usr/local/bin/experiment-mode
```

## Experiment workflow

```bash
experiment-mode on          # confine GrepThink + slug-mcp to core 3 (cores 0-2 freed)
systemd-run --scope -p AllowedCPUs=0-2 -p CPUWeight=10000 /zeus <args>   # run zeus pinned
# ... run experiment ...
experiment-mode off         # restore web tier to unit defaults
experiment-mode status      # inspect effective limits anytime
```

Defaults assume a 4-vCPU box (web tier → core 3, zeus → cores 0-2). Override
per run: `WEB_CPUS=2-3 WEB_QUOTA=5% ZEUS_CPUS=0-1 experiment-mode on`.

Optional: also isolate nginx for a run with
`sudo systemctl set-property --runtime nginx.service AllowedCPUs=3`
(left out of the script since nginx is shared and low-cost here).
