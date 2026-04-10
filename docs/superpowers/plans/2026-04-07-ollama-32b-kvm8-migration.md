# Ollama Qwen 2.5 Coder 32B — KVM8 Migration Plan

> **For agentic workers:** Execute task-by-task. This plan migrates Ollama from the shared KVM4 (7B model) to a dedicated KVM8 server (32B model).

**Goal:** Move Ollama Qwen Coder 2.5 from KVM4 (7B, shared with Dokploy) to a dedicated KVM8 server (32B, 32GB RAM), and reconfigure videoDJ.Studio to use the new endpoint.

**Why:** KVM4 only has enough RAM for the 7B model and shares resources with Dokploy + all production apps. KVM8 (32GB RAM) gives Ollama dedicated resources and runs the 32B model which is significantly better at coding/reasoning.

**Tech Stack:** Ubuntu 24.04, Ollama, Traefik (reverse proxy), Let's Encrypt, Cloudflare DNS, Docker.

**Authentication model:** API keys per project, transmitted as HTTP Basic Auth (`username:apikey`). Each project gets a unique username + key in `/etc/traefik/api_keys` (htpasswd format with bcrypt). Revoke a project by deleting its line and reloading Traefik. No Traefik plugins needed — uses built-in basicAuth middleware.

**Multi-project key registry (manual tracking):**

| Project | Username | Key prefix | Stored in |
|---------|----------|------------|-----------|
| videoDJ | `videodj` | `vdj_...` | videoDJ user enters via Settings UI; cached in PostgreSQL agent_settings |
| mavifinans | `mavifinans` | `mvf_...` | mavifinans env var or vault |
| (future) | `<projname>` | `<pfx>_...` | (per project) |

**To add a new project:**
```bash
# On KVM8
htpasswd -B /opt/traefik/api_keys newproject     # enter generated key
# Traefik auto-reloads (file is mounted read-only and watched)
```

**To revoke a project:**
```bash
htpasswd -D /opt/traefik/api_keys projectname
# Traefik auto-reloads
```

---

## Prerequisites (before starting)

- [ ] KVM8 VPS provisioned at Hostinger (Ubuntu 24.04, 32GB RAM, ≥100GB disk)
- [ ] Root SSH access to KVM8
- [ ] DNS A record for `ollama.videodj.studio` ready to point to KVM8 IP
- [ ] Cloudflare or Let's Encrypt SSL certificate strategy decided
- [ ] Backup of current videoDJ database taken (just in case)

---

## Phase 1: KVM8 Server Setup

### Task 1: Initial server hardening

- [ ] SSH into KVM8 as root
- [ ] Create non-root sudo user: `adduser videodj && usermod -aG sudo videodj`
- [ ] Copy SSH key: `mkdir -p /home/videodj/.ssh && cp ~/.ssh/authorized_keys /home/videodj/.ssh/ && chown -R videodj:videodj /home/videodj/.ssh && chmod 700 /home/videodj/.ssh && chmod 600 /home/videodj/.ssh/authorized_keys`
- [ ] Disable root SSH login: edit `/etc/ssh/sshd_config` → `PermitRootLogin no` → `systemctl restart ssh`
- [ ] Install UFW: `apt update && apt install -y ufw`
- [ ] Allow SSH, HTTP, HTTPS: `ufw allow 22 && ufw allow 80 && ufw allow 443 && ufw enable`
- [ ] Verify: `ufw status`

### Task 2: Install Docker + Docker Compose

- [ ] `curl -fsSL https://get.docker.com | sh`
- [ ] `usermod -aG docker videodj`
- [ ] Verify: `docker --version && docker compose version`

### Task 3: Install Ollama

- [ ] `curl -fsSL https://ollama.com/install.sh | sh`
- [ ] Verify Ollama running: `systemctl status ollama`
- [ ] Configure Ollama to bind to localhost only (we'll proxy via Traefik):
  - Edit `/etc/systemd/system/ollama.service.d/override.conf` (create if missing):
    ```
    [Service]
    Environment="OLLAMA_HOST=127.0.0.1:11434"
    Environment="OLLAMA_MODELS=/var/lib/ollama/models"
    Environment="OLLAMA_KEEP_ALIVE=24h"
    Environment="OLLAMA_NUM_PARALLEL=2"
    Environment="OLLAMA_MAX_LOADED_MODELS=1"
    ```
- [ ] `systemctl daemon-reload && systemctl restart ollama`
- [ ] Verify: `curl http://127.0.0.1:11434/api/tags`

### Task 4: Pull Qwen 2.5 Coder 32B model

- [ ] `ollama pull qwen2.5-coder:32b` (this will take a while — ~20GB download)
- [ ] Verify: `ollama list` should show `qwen2.5-coder:32b` (~19GB)
- [ ] Test inference: `ollama run qwen2.5-coder:32b "write a bubble sort in python"` — confirm it responds
- [ ] Check memory usage during inference: `htop` or `free -h` — should use ~22GB RAM

---

## Phase 2: Public HTTPS Endpoint

### Task 5: Set up Traefik reverse proxy

Create `/opt/traefik/docker-compose.yml`:

```yaml
services:
  traefik:
    image: traefik:v3.6
    container_name: traefik
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./traefik.yml:/etc/traefik/traefik.yml:ro
      - ./acme.json:/acme.json
      - ./dynamic.yml:/etc/traefik/dynamic.yml:ro
    networks:
      - traefik-net

networks:
  traefik-net:
    external: true
```

Create `/opt/traefik/traefik.yml`:

```yaml
entryPoints:
  web:
    address: ":80"
    http:
      redirections:
        entryPoint:
          to: websecure
          scheme: https
  websecure:
    address: ":443"

certificatesResolvers:
  letsencrypt:
    acme:
      email: your@email.com
      storage: /acme.json
      httpChallenge:
        entryPoint: web

providers:
  file:
    filename: /etc/traefik/dynamic.yml
    watch: true
  docker:
    exposedByDefault: false
```

Create `/opt/traefik/dynamic.yml` to proxy Ollama with API key auth:

```yaml
http:
  routers:
    ollama:
      rule: "Host(`ollama.videodj.studio`)"
      entryPoints:
        - websecure
      service: ollama
      tls:
        certResolver: letsencrypt
      middlewares:
        - ollama-apikey
        - ollama-ratelimit
        - ollama-cors

  services:
    ollama:
      loadBalancer:
        servers:
          - url: "http://172.17.0.1:11434"

  middlewares:
    # API key authentication (basic auth with username "api" and key as password)
    # Each project gets its own line — revoke by removing the line
    ollama-apikey:
      basicAuth:
        usersFile: "/etc/traefik/api_keys"
        realm: "Ollama API"
        removeHeader: true   # Don't forward auth header to Ollama backend

    # Rate limit per IP (prevent abuse)
    ollama-ratelimit:
      rateLimit:
        average: 60
        burst: 120
        period: 1m

    # Allow browser-based clients (videoDJ web app)
    ollama-cors:
      headers:
        accessControlAllowOriginList:
          - "https://app.videodj.studio"
          - "https://admin.videodj.studio"
          - "https://mavifinans.sh"
        accessControlAllowMethods:
          - GET
          - POST
          - OPTIONS
        accessControlAllowHeaders:
          - "Authorization"
          - "Content-Type"
        accessControlMaxAge: 100
```

### Task 5b: Generate API keys for each project

Create `/opt/traefik/api_keys` (htpasswd format, one entry per project):

```bash
# Install htpasswd
apt install -y apache2-utils

# Generate API keys (random 32-char strings, prefixed by project)
VDJ_KEY="vdj_$(openssl rand -hex 16)"
MVF_KEY="mvf_$(openssl rand -hex 16)"

# Username is always "api", password is the key
htpasswd -B -c /opt/traefik/api_keys api  # First entry — overwrites file
# Enter VDJ_KEY when prompted, then run:
htpasswd -B /opt/traefik/api_keys api     # Add more — does NOT overwrite
# Enter MVF_KEY when prompted

# IMPORTANT: Save the plaintext keys somewhere safe — you can't recover them later
echo "videoDJ key: $VDJ_KEY"
echo "mavifinans key: $MVF_KEY"
```

Wait — basic auth with the same username for multiple entries doesn't work cleanly. **Better approach:** use unique usernames per project, but always send `api` from the client side using a custom Traefik plugin. Or simplest: **use the project name as username**:

```bash
# Generate keys
VDJ_KEY=$(openssl rand -hex 24)   # vdj key
MVF_KEY=$(openssl rand -hex 24)   # mavifinans key

# Add to htpasswd (one user per project)
htpasswd -B -c /opt/traefik/api_keys videodj      # enter VDJ_KEY when prompted
htpasswd -B /opt/traefik/api_keys mavifinans      # enter MVF_KEY when prompted

# Save plaintext keys — store in a password manager
echo "videodj:$VDJ_KEY" > /root/ollama_keys.txt
echo "mavifinans:$MVF_KEY" >> /root/ollama_keys.txt
chmod 600 /root/ollama_keys.txt
```

Then clients send: `Authorization: Basic base64(videodj:vdj_secretkey)` — Traefik validates against `/etc/traefik/api_keys`.

### Task 5c: Mount api_keys into Traefik container

Update `/opt/traefik/docker-compose.yml` volumes section:

```yaml
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./traefik.yml:/etc/traefik/traefik.yml:ro
      - ./acme.json:/acme.json
      - ./dynamic.yml:/etc/traefik/dynamic.yml:ro
      - ./api_keys:/etc/traefik/api_keys:ro
```

### Task 5d: Start Traefik

- [ ] Create all files above
- [ ] Create network: `docker network create traefik-net`
- [ ] Touch acme.json: `touch /opt/traefik/acme.json && chmod 600 /opt/traefik/acme.json`
- [ ] Start Traefik: `cd /opt/traefik && docker compose up -d`
- [ ] Check logs: `docker logs traefik -f` — wait for cert acquisition

### Task 6: DNS + SSL verification

- [ ] Add A record `ollama.videodj.studio` → KVM8 public IP
- [ ] Wait for DNS propagation: `dig +short ollama.videodj.studio`
- [ ] Verify SSL + auth: `curl -u videodj:YOUR_VDJ_KEY https://ollama.videodj.studio/api/tags`
- [ ] Should return `{"models":[{"name":"qwen2.5-coder:32b",...}]}`
- [ ] Test rejection without auth: `curl https://ollama.videodj.studio/api/tags` → should return 401

---

## Phase 3: videoDJ.Studio Integration

### Task 7: Update agent provider defaults

In `web/components/SetupModal.tsx` line ~106:

```typescript
ollama: { 
  endpoint: 'https://ollama.videodj.studio/v1/chat/completions', 
  model: 'qwen2.5-coder:32b', 
  label: 'Ollama (Qwen 2.5 Coder 32B)' 
},
```

In `web/app/api/settings/route.ts` line ~230:

```typescript
ollama: 'https://ollama.videodj.studio/v1/chat/completions',
```
And:
```typescript
ollama: 'qwen2.5-coder:32b',
```

In `web/app/api/agent/route.ts` line ~534:

```typescript
ollama: 'https://ollama.videodj.studio/v1/chat/completions',
```
And:
```typescript
ollama: 'qwen2.5-coder:32b',
```

### Task 8: Add API key auth (basic auth wire format) for Ollama

The Ollama Traefik proxy expects `Authorization: Basic base64(videodj:VDJ_KEY)`. Update both `testApiKey` (in `web/app/api/settings/route.ts`) and `callOpenAICompatibleAPI` (in `web/app/api/agent/route.ts`).

**Helper function** — add to both files:

```typescript
function buildAuthHeader(provider: string, apiKey: string, endpoint: string): string {
  // Ollama proxy uses basic auth with username "videodj" + API key as password
  if (provider === 'ollama' || endpoint.includes('ollama.videodj.studio')) {
    const username = process.env.OLLAMA_USERNAME || 'videodj'
    const auth = Buffer.from(`${username}:${apiKey}`).toString('base64')
    return `Basic ${auth}`
  }
  // All other providers use Bearer token
  return `Bearer ${apiKey}`
}
```

**Update fetch calls** in both files — replace:
```typescript
headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
```
With:
```typescript
headers: { 'Authorization': buildAuthHeader(provider, apiKey, url), 'Content-Type': 'application/json' },
```

### Task 8b: Update SetupModal to handle Ollama API key like other providers

The Ollama provider now requires a real API key (the one generated in Task 5b for videoDJ). Remove the "Ollama doesn't need a key" special case in `web/components/SetupModal.tsx`:

```typescript
async function handleSaveApiKey() {
  if (!apiKeyInput.trim()) return  // ALL providers now require a key
  // ... rest of function unchanged, no special-casing for Ollama
}
```

Update the Ollama option label and add help text:

```typescript
ollama: {
  endpoint: 'https://ollama.videodj.studio/v1/chat/completions',
  model: 'qwen2.5-coder:32b',
  label: 'Ollama (Qwen 2.5 Coder 32B — self-hosted)'
},
```

Add helper text below the API key field when Ollama is selected:
> "Get your Ollama API key from your admin. Format: vdj_..."

### Task 9: Add OLLAMA_USERNAME to web Dockerfile

The username is `videodj` (matches the htpasswd entry on KVM8). The actual API key is provided by the user via the Settings UI — never baked into the image.

```dockerfile
ENV OLLAMA_USERNAME=videodj
```

### Task 10: Deploy

- [ ] Commit all changes
- [ ] Push to GitHub
- [ ] Rebuild web container on KVM4: `ssh root@187.124.209.17 "cd /tmp && rm -rf vdj-rebuild && git clone --depth 1 https://github.com/flndrn-dev/videodj.git vdj-rebuild && cd vdj-rebuild/web && docker build -t videodj-web:latest . && docker service update --force --image videodj-web:latest webapp_videodj-web && rm -rf /tmp/vdj-rebuild"`

### Task 11: Test end-to-end

- [ ] Open `app.videodj.studio` → Settings → AI Agent
- [ ] Provider: Ollama (Qwen 2.5 Coder 32B — self-hosted)
- [ ] Endpoint and model auto-fill
- [ ] Paste your videoDJ Ollama API key (the `vdj_...` key from Task 5b)
- [ ] Click Connect → should show "Connected"
- [ ] Open Linus chat → send a test message → verify it responds via Ollama
- [ ] On KVM8, verify the request hit Ollama: `journalctl -u ollama -n 20`
- [ ] Verify rate limiting works: spam 100+ requests → should get 429 after 60/min

---

## Phase 4: Performance Tuning

### Task 12: Enable GPU acceleration (if KVM8 has a GPU)

- [ ] Check for GPU: `lspci | grep -i nvidia`
- [ ] If NVIDIA GPU available:
  - Install NVIDIA drivers: `apt install -y nvidia-driver-535`
  - Install nvidia-container-toolkit
  - Restart Ollama: `systemctl restart ollama`
  - Verify GPU usage: `nvidia-smi` while Ollama is generating

### Task 13: Tune Ollama for production

- [ ] Adjust `/etc/systemd/system/ollama.service.d/override.conf`:
  ```
  [Service]
  Environment="OLLAMA_HOST=127.0.0.1:11434"
  Environment="OLLAMA_KEEP_ALIVE=24h"     # Keep model in memory
  Environment="OLLAMA_NUM_PARALLEL=4"     # Parallel requests
  Environment="OLLAMA_MAX_LOADED_MODELS=1"
  Environment="OLLAMA_FLASH_ATTENTION=1"  # Speed up inference
  ```
- [ ] `systemctl daemon-reload && systemctl restart ollama`
- [ ] Benchmark: `time curl -X POST http://127.0.0.1:11434/api/generate -d '{"model":"qwen2.5-coder:32b","prompt":"hello","stream":false}'`

### Task 14: Set up monitoring

- [ ] Install `node_exporter` for Prometheus metrics
- [ ] Add Ollama metrics endpoint (port 11434 has Prometheus metrics built-in)
- [ ] Connect to existing Grafana on KVM4 or set up new instance
- [ ] Alert on: high RAM (>28GB), high response latency (>30s), Ollama process down

---

## Phase 5: Decommission KVM4 Ollama

### Task 15: Remove old 7B model from KVM4

- [ ] SSH into KVM4: `ssh root@187.124.209.17`
- [ ] Stop Ollama: `systemctl stop ollama`
- [ ] Optional: keep installed for fallback, or fully remove:
  - `systemctl disable ollama`
  - `apt remove ollama` (or whatever the install method was)
  - `rm -rf /var/lib/ollama` (frees ~5GB)
- [ ] Verify videoDJ no longer needs it: hit Linus chat from web app — should work via KVM8 endpoint

---

## Rollback Plan

If KVM8 goes down or has issues:

1. SSH into KVM4: `ssh root@187.124.209.17`
2. Re-enable local Ollama: `systemctl start ollama`
3. Update agent provider in app: change endpoint back to `http://172.18.0.1:11434/v1/chat/completions` and model to `qwen2.5-coder:7b`
4. Rebuild web container

---

## Future Enhancements (post-migration)

- [ ] Add `/api/ollama/models` endpoint that fetches `GET /api/tags` and returns installed models — populate model picker in UI instead of typing model name
- [ ] Add streaming responses (SSE) for faster perceived response time
- [ ] Add model warmup on startup (preload model into memory)
- [ ] Set up Ghost agent on KVM8 for self-healing of the Ollama service
- [ ] Add usage analytics — track tokens per user for tier billing
- [ ] Multi-model support — let users switch between qwen2.5-coder:32b, llama3.3:70b, etc. from the UI
- [ ] Tier integration — only DJ User tier can use Ollama (saves on Anthropic API costs for free tier users)

---

## File Summary

### New files
| File | Purpose |
|------|---------|
| `/opt/traefik/docker-compose.yml` | Traefik service definition |
| `/opt/traefik/traefik.yml` | Traefik static config |
| `/opt/traefik/dynamic.yml` | Ollama proxy + auth + rate limit |
| `/etc/systemd/system/ollama.service.d/override.conf` | Ollama tuning |

### Modified files
| File | Changes |
|------|---------|
| `web/components/SetupModal.tsx` | Update Ollama endpoint to public URL + 32B model |
| `web/app/api/settings/route.ts` | Update default endpoint + model + add basic auth |
| `web/app/api/agent/route.ts` | Update default endpoint + model + add basic auth |
| `web/Dockerfile` | Add `OLLAMA_PROXY_PASSWORD` env var |
