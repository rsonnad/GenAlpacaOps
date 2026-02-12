# Headless Runner — Setup on DO Droplet

## Overview

Listens for GitHub push webhooks. When a push to `main` adds files to `claude-headless-instructions/`, it pulls the repo, reads the instruction file, runs Claude Code with those instructions, commits the results, and pushes to main.

## 1. Clone/copy to droplet

```bash
sudo mkdir -p /opt/headless-runner
sudo chown bugfixer:bugfixer /opt/headless-runner
cp headless_runner.js package.json /opt/headless-runner/
cd /opt/headless-runner
npm install
```

## 2. Clone repo (working copy)

```bash
sudo mkdir -p /opt/headless-runner/repo
sudo chown bugfixer:bugfixer /opt/headless-runner/repo
git clone https://github.com/rsonnad/alpacapps.git /opt/headless-runner/repo
```

## 3. Create .env

```bash
cat > /opt/headless-runner/.env << 'EOF'
GITHUB_WEBHOOK_SECRET=<generate-a-secret>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
REPO_DIR=/opt/headless-runner/repo
PORT=9100
MAX_RUN_TIMEOUT_MS=600000
EOF
```

Generate a webhook secret: `openssl rand -hex 32`

## 4. Install systemd service

```bash
sudo cp headless-runner.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable headless-runner
sudo systemctl start headless-runner
sudo journalctl -u headless-runner -f  # watch logs
```

## 5. Add Caddy route

Add to your Caddyfile (the one that handles `cam.alpacaplayhouse.com` or a new domain):

```
# Option A: Add to existing cam.alpacaplayhouse.com
cam.alpacaplayhouse.com {
    # ... existing camera proxy routes ...

    handle /hooks/github-push {
        reverse_proxy localhost:9100 {
            # Rewrite path to /webhook
            header_up X-Forwarded-For {remote_host}
        }
    }
}

# Option B: Use a separate subdomain
hooks.alpacaplayhouse.com {
    handle /github-push {
        reverse_proxy localhost:9100
    }
}
```

Note: If using the Caddy route, set the `rewrite` or adjust the path. The worker listens on `/webhook`, so configure Caddy to either:
- Forward `/hooks/github-push` → `localhost:9100/webhook` (use `rewrite` directive)
- Or change the worker's path to match your Caddy route

Simple Caddy config with rewrite:
```
cam.alpacaplayhouse.com {
    # existing routes...

    handle_path /hooks/github-push {
        rewrite * /webhook
        reverse_proxy localhost:9100
    }
}
```

Then reload: `sudo systemctl reload caddy`

## 6. Configure GitHub webhook

1. Go to **GitHub repo → Settings → Webhooks → Add webhook**
2. **Payload URL**: `https://cam.alpacaplayhouse.com/hooks/github-push` (or your chosen URL)
3. **Content type**: `application/json`
4. **Secret**: Same value as `GITHUB_WEBHOOK_SECRET` in `.env`
5. **Events**: Select "Just the push event"
6. **Active**: Check the box

## 7. Test

```bash
# Health check
curl https://cam.alpacaplayhouse.com/hooks/github-push  # should 404 (GET)
curl http://localhost:9100/health  # from droplet

# Push a test instruction file to main and watch logs
echo "List all files in the residents/ directory and report back" > claude-headless-instructions/test-run.md
git add -A && git commit -m "headless: test run" && git push origin main
sudo journalctl -u headless-runner -f
```
