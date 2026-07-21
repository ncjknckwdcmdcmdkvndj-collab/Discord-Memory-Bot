# Running the Discord Bot on GitHub Actions

The workflow file at `.github/workflows/run-bot.yml` lets you run the bot
directly from GitHub — no server needed.

---

## Quick start

### 1 — Add repository secrets

Go to **Settings → Secrets and variables → Actions → New repository secret**
and add:

| Secret name        | What it is                                      |
|--------------------|--------------------------------------------------|
| `DISCORD_BOT_TOKEN`| Your bot's token (from Discord Developer Portal) |
| `SESSION_SECRET`   | Any long random string (e.g. `openssl rand -hex 32`) |
| `DATABASE_URL`     | PostgreSQL connection string for your database   |

For `DATABASE_URL` you need a database that is reachable from GitHub's runners.
Free options: [Neon](https://neon.tech), [Supabase](https://supabase.com),
[Railway](https://railway.app).  Format:
```
postgresql://user:password@host:5432/dbname
```

### 2 — Push schema to your database

Run this once from your local machine (with `DATABASE_URL` set in your
environment) to create the tables:

```bash
pnpm --filter @workspace/db run push
```

### 3 — Trigger the workflow

Go to the **Actions** tab → **Run Discord Bot** → **Run workflow**.

The bot will stay running for up to ~6 hours (GitHub's limit for hosted
runners).  For 24/7 uptime see the options below.

---

## Automatic triggers

The workflow also starts automatically on every push to `main` or `master`
that touches the bot source (`artifacts/api-server/**`, `lib/**`).
Remove that trigger from `.github/workflows/run-bot.yml` if you only want
manual runs.

---

## 24/7 uptime options

GitHub-hosted runners are ephemeral and cap out at 6 hours, so they are fine
for testing but not production.

| Option | Notes |
|--------|-------|
| **Self-hosted runner** | Add your own always-on machine as a GitHub runner; the same workflow file works unchanged. |
| **Railway / Render / Fly.io** | Push the repo; point the start command at `scripts/start-bot.sh`. |
| **Docker** | Build the included `Dockerfile` and run the image anywhere. |

---

## Docker

```bash
# Build
docker build -t discord-bot .

# Run
docker run -d \
  -e DISCORD_BOT_TOKEN=your_token \
  -e SESSION_SECRET=your_secret \
  -e DATABASE_URL=postgresql://... \
  discord-bot
```
