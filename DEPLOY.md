# GrepThink 2.0 — Production Deployment on VM2

> **STATUS: LIVE** at **https://2262-cse115b-02.be.ucsc.edu/** (root `/`), on the
> PROD Supabase project `yfezwtoeoexfksvbpxmi`. Backend = systemd `grepthink-api`
> (uvicorn, 3 workers, `127.0.0.1:5001`); SPA in `/var/www/grepthink`; `/api/`
> proxied in the shared slug-mcp nginx site. For repeat deploys jump to
> **§9 Redeploy** (use `deploy.sh`). The §0–§7 steps below are the first-time setup.

Runbook for deploying this branch (`beta-vm2`) to **VM2**
(`2262-cse115b-02.be.ucsc.edu`) as a native systemd service behind the shared
nginx + TLS, coexisting with slug-mcp / zeus. No Docker, no new DNS, no new
TLS, no new public port.

> **The one thing to internalize:** deployment has **two halves**.
> - **Backend** runs *from the clone on VM2* (Python venv + uvicorn + systemd).
> - **Frontend** is **built OFF the VM** (your laptop or CI) and only the static
>   `dist/` is copied over. **VM2 has no Node and ~5 GB disk free — never build the
>   frontend or put `node_modules` on it.**

---

## 0. TL;DR (first manual deploy)

```bash
# --- on VM2 (one-time prep) ---
sudo apt-get update && sudo apt-get install -y python3-venv
git clone -b beta-vm2 ssh://git@github.com/grepthink2/grepthink2.0.git /home/pmundra/grepthink2.0
sudo mkdir -p /var/www/grepthink && sudo chown pmundra:pmundra /var/www/grepthink
# create /home/pmundra/grepthink2.0/.env  (see §3), then chmod 600 it
cd /home/pmundra/grepthink2.0/backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
sudo cp deploy/grepthink-api.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now grepthink-api
sudo install -m 0755 deploy/experiment-mode /usr/local/bin/experiment-mode
# edit the nginx site per §5, then:
sudo nginx -t && sudo systemctl reload nginx

# --- on your laptop (frontend) ---
cd frontend
VITE_API_URL=https://2262-cse115b-02.be.ucsc.edu \
VITE_SUPABASE_URL=https://<proj>.supabase.co \
VITE_SUPABASE_KEY=<anon-key> \
npm ci && npm run build
rsync -avz --delete dist/ pmundra@2262-cse115b-02.be.ucsc.edu:/var/www/grepthink/

# --- Supabase dashboard (§6) + verify (§7) ---
```

---

## 1. What's on this branch

Beyond the app, `beta-vm2` includes the fixes and deploy tooling from the
pre-deploy hardening pass:

- **Backend fixes:** `delete_project` 500-on-success bug; re-added the
  `remove-product-owner` route; **removed the `test-create` role-bypass
  backdoor**; registered `SecurityHeadersMiddleware`; added instructor-or-enrolled
  access checks to `get_class` / `get_class_students`.
- **Frontend fixes:** `ClassManagement` role check (`'teacher'`→`'instructor'`);
  removed mock data from the student home; declared the real `ApiProject` fields
  so `tsc -b` / `npm run build` are clean; deleted the `TestProjects` page + routes.
- **Tests:** `backend/tests/test_{classes,projects,role_authorization,known_issues}_*`
  — **123 passing** (`cd backend && .venv/bin/python -m pytest -q`).
- **Deploy artifacts:** `deploy/grepthink-api.service`, `deploy/experiment-mode`,
  `deploy/README.md`, and this file.

---

## 2. Architecture

```
Browser ──HTTPS──> nginx :443 (existing TLS cert /etc/ssl/slug-mcp/, host 2262-cse115b-02…)
                     ├─ /            → static React build in /var/www/grepthink  (SPA: try_files → index.html)
                     ├─ /api/        → http://127.0.0.1:5001  (FastAPI/uvicorn, systemd grepthink-api, 3 workers)
                     ├─ /mcp         → 127.0.0.1:3000  (slug-mcp — UNCHANGED)
                     ├─ /zeus/       → 127.0.0.1:8080  (zeus — UNCHANGED)
                     └─ /healthz     → 200             (UNCHANGED)
uvicorn ──> Supabase (external: Postgres + Auth)
```

## 3. VM2 facts (verified) + the `.env`

| | |
|---|---|
| Host / user | `2262-cse115b-02.be.ucsc.edu` / `pmundra` (password SSH; **passwordless sudo**) |
| OS / runtime | Ubuntu 22.04.5, **Python 3.10.12**, git, nginx 1.18 |
| Capacity | **4 vCPU, 7.8 GiB RAM, ~5 GB disk free, NO swap** |
| Missing | **Node/npm, pip3, docker** (→ `apt install python3-venv`; build frontend off-box) |
| Port 5001 | free (3000=slug-mcp, 8080=zeus) |
| TLS | shared cert `/etc/ssl/slug-mcp/{fullchain,privkey}.pem` — reuse, nothing to provision |

`config.py` loads `.env` from the **repo root** (`<repo>/.env`) and
`settings.validate()` **hard-fails the process** if `SUPABASE_URL` or
`SUPABASE_KEY` is missing — so the service won't start without a valid `.env`.

**`/home/pmundra/grepthink2.0/.env`** (`chmod 600`; systemd-`EnvironmentFile`-safe
syntax — `KEY=value`, one per line, no `export`, quote values with spaces):

```dotenv
SUPABASE_URL=https://<proj>.supabase.co
SUPABASE_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
SUPABASE_JWT_SECRET=<jwt-secret>          # needed for HS256 tokens; RS256 works via JWKS without it
# SUPABASE_JWK_JSON={...}                  # optional, only if you pin a static JWK
CORS_ORIGINS=https://2262-cse115b-02.be.ucsc.edu   # never "*"
HOST=127.0.0.1
PORT=5001
ENVIRONMENT=production
# .edu verification emails (optional; flow is currently disabled in the UI):
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USER=resend
SMTP_PASSWORD=<resend-api-key>
SMTP_FROM="GrepThink <noreply@yourdomain.com>"
```

## 4. Backend (systemd)

The unit `deploy/grepthink-api.service` runs `uvicorn app.main:app` on
`127.0.0.1:5001` with **3 workers**, `--proxy-headers`, and cgroup resource
limits baked in (see §8). Install:

```bash
sudo cp deploy/grepthink-api.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now grepthink-api
systemctl status grepthink-api --no-pager
curl -fsS http://127.0.0.1:5001/health    # expect 200
```

Logs: `journalctl -u grepthink-api -f`.

## 5. nginx — patch the shared `slug-mcp` site

Edit **`/etc/nginx/sites-enabled/slug-mcp`**. Keep `/mcp`, `/zeus/`, `/healthz`
exactly as they are. Inside the existing `server { listen 443 ssl http2; … }`
block, **replace `location / { return 404; }`** with the SPA + API blocks:

```nginx
    # --- GrepThink SPA (static) ---
    root /var/www/grepthink;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
    # content-hashed assets: cache hard
    location ~* \.(?:js|css|png|jpe?g|gif|ico|svg|webp|woff2?)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }
    # index.html must NOT be cached, or users get stale bundles after deploys
    location = /index.html { add_header Cache-Control "no-store"; }

    # --- GrepThink API ---
    location /api/ {
        proxy_pass http://127.0.0.1:5001;     # no trailing slash → /api/* forwarded unchanged
        proxy_http_version 1.1;
        proxy_set_header Connection "";        # keepalive to uvicorn
        client_max_body_size 10m;              # roster CSV / avatar uploads (server default is 1m)
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
    # optional: external health (backend mounts /health at root, shadowed by the SPA)
    location = /api/health { proxy_pass http://127.0.0.1:5001/health; }
```

Then remove the stray duplicate site and reload:

```bash
sudo rm -f /etc/nginx/sites-enabled/slug-mcp.bak.*
sudo nginx -t && sudo systemctl reload nginx
```

## 6. Supabase dashboard (external, one-time)

**Auth → URL Configuration:** add `https://2262-cse115b-02.be.ucsc.edu` as the
Site URL and to the redirect allowlist — otherwise sign-in / email-confirmation
redirects break in production.

## 7. Verify end-to-end

```bash
# backend up
curl -fsS http://127.0.0.1:5001/health                       # 200
# SPA served
curl -I https://2262-cse115b-02.be.ucsc.edu/                 # 200 text/html
# API proxied (NOT the SPA fallback): expect JSON/401, not HTML
curl -s https://2262-cse115b-02.be.ucsc.edu/api/classes | head -c 200
# regression: neighbors still fine
curl -fsSI https://2262-cse115b-02.be.ucsc.edu/healthz
curl -sI    https://2262-cse115b-02.be.ucsc.edu/mcp
```
Then open the site, sign in via Supabase, exercise a feature (classes list).

## 8. Resource control during zeus experiments

`grepthink-api.service` ships **Layer-1 soft priority** (`CPUWeight=20`,
`IOWeight=20`, `MemoryHigh=512M`, `MemoryMax=768M`) — it automatically yields
CPU/IO to zeus under contention, full speed when idle, no toggle.

For a **measured** run, hard-pin the web tier off zeus's cores (Layer 2):

```bash
experiment-mode on      # pins grepthink-api + slug-mcp to core 3 → cores 0-2 free for zeus
systemd-run --scope -p AllowedCPUs=0-2 -p CPUWeight=10000 /zeus <args>
# … run experiment …
experiment-mode off     # restore; experiment-mode status to inspect
```

Full details in [`deploy/README.md`](deploy/README.md).

## 9. Redeploy (use `deploy.sh`)

`deploy.sh` (repo root) runs **on the VM** and is idempotent: it updates backend
deps, validates the app imports against `.env` *before* bouncing the live
service, optionally publishes a prebuilt `dist`, restarts `grepthink-api`, and
gates on `/health`. It never builds the frontend (no Node on VM2) and never
touches nginx or `.env`.

This deploy was delivered by **rsync** (the VM has no git clone / GitHub creds),
so the repeat flow from your laptop is:

```bash
# 1. build the frontend locally (off-VM) with the PROD values
cd frontend && \
  VITE_API_URL=https://2262-cse115b-02.be.ucsc.edu \
  VITE_SUPABASE_URL=https://yfezwtoeoexfksvbpxmi.supabase.co \
  VITE_SUPABASE_KEY=sb_publishable_ulrQdAvLkmi9jE7KapykyA_31m7DUJg \
  npm ci && npm run build
tar -czf /tmp/grepthink-dist.tgz -C dist .

# 2. ship to the VM (needs ssh access — key or sshpass; .env/secrets never sent)
rsync -az --delete --exclude '.git' --exclude node_modules --exclude .venv \
  --exclude dist --exclude .env --exclude 'supabase/.temp' \
  ./ pmundra@2262-cse115b-02.be.ucsc.edu:/home/pmundra/grepthink2.0/
scp /tmp/grepthink-dist.tgz pmundra@2262-cse115b-02.be.ucsc.edu:/tmp/

# 3. run the idempotent VM-side deploy
ssh pmundra@2262-cse115b-02.be.ucsc.edu \
  'cd /home/pmundra/grepthink2.0 && ./deploy.sh --dist /tmp/grepthink-dist.tgz'
```

Backend-only change? Skip steps 1–2's frontend bits and run `./deploy.sh` with
no `--dist`. (If you later add a VM deploy key + `git clone`, `deploy.sh`
auto-detects `.git` and `git pull`s instead — no other change needed.)

**Rollback:** re-run with a previous `dist` tarball / prior source for the
frontend+backend; nginx rolls back by restoring `/home/pmundra/slug-mcp.nginx.bak`
then `sudo nginx -t && sudo systemctl reload nginx`.

## 10. Nuances & gotchas (read before you ship)

1. **Two halves** (repeated because it bites everyone): backend from the VM
   clone; frontend `dist/` built off-VM and rsync'd. No Node on VM2.
2. **`VITE_API_URL` is baked at build time.** Omit it and the prod bundle calls
   `http://localhost:5001` (`frontend/src/lib/api.ts:3`) → every API call fails
   in users' browsers. Set it to `https://2262-cse115b-02.be.ucsc.edu` for the
   build. (Alternative: change that default to `''` for same-origin relative
   `/api` calls and drop the footgun entirely.)
3. **Backend `/health` is at root**, shadowed by the SPA `location /`. Check it
   on `127.0.0.1:5001/health` or via the optional `/api/health` proxy — not at
   the public `/health`.
4. **`/api/` proxy_pass has no trailing path on purpose** so `/api/classes`
   reaches the backend unchanged (its routers are `/api/*`-prefixed). Don't add
   a trailing slash to `proxy_pass`.
5. **Server-wide `client_max_body_size 1m`** in the slug-mcp site — the `/api/`
   block raises it to 10m for roster CSV / avatar uploads.
6. **Don't break the neighbors.** Only touch `location /` and add `/api/`; leave
   `/mcp`, `/zeus/`, `/healthz` intact; always `sudo nginx -t` before reload.
7. **No swap on the box.** A too-tight `MemoryMax` OOM-kills rather than swaps;
   the baked caps (512M/768M) suit 3 idle-ish workers — bump them if you raise
   worker count or see OOMs in `journalctl`.
8. **Security-header overlap (polish, not a blocker):** the app's
   `SecurityHeadersMiddleware` and the nginx site both set HSTS /
   X-Content-Type-Options / Referrer-Policy, so `/api/` responses carry them
   twice. Harmless; to tidy, drop those three from one side (simplest: let nginx
   own them for the host).
9. **Python 3.10 venv.** Deps are unpinned and use no 3.11+-only syntax, so the
   3.10 venv runs cleanly. If a dep ever needs newer, install `python3.12` via
   deadsnakes and `python3.12 -m venv` — still isolated, no global Python change.
10. **Disk is tight (~5 GB).** venv + `dist/` are small (<~400 MB); watch
    `df -h /` after the first deploy. Never rsync `node_modules`.
11. **Front-end bundle is one ~1.24 MB chunk** (353 KB gzip; nginx gzip is on).
    Fine to ship; for faster first paint, route-level `React.lazy()` later.
12. **`.edu` email verification** needs working `SMTP_*` creds; the UI entry is
    currently commented out, so it's optional for first deploy.

## 11. Next steps (automate)

Once the manual deploy is green, add (mirroring slug-mcp): a repo-root
`deploy.sh` (VM-side: pull, venv install, rsync dist, restart, `nginx -t` +
reload, curl health) and `.gitlab-ci.yml` (build stage `node:20` → `dist/`
artifact; deploy stage SSHes in and runs `deploy.sh` on `main`/`beta-vm2`). CI
vars: `SSH_PRIVATE_KEY`, `VM_HOST_KEY`, `VITE_API_URL`, `VITE_SUPABASE_URL`,
`VITE_SUPABASE_KEY`.
```
