# Run this bot via GitHub Actions

This branch adds a GitHub Actions workflow and helper files to run the Discord bot from an Actions runner.

Files added on branch `gh-run-bot`:
- .github/workflows/run-bot.yml — manual workflow (Workflow → Run workflow) that checks out the repo, installs dependencies, builds (if TypeScript), and runs `npm run start`.
- scripts/start-bot.sh — convenience script to build (if needed) and start the bot.
- Dockerfile — optional Docker image definition for running the bot elsewhere.

Required repository secret for the Discord bot token
- DISCORD_TOKEN — set this secret to your bot's token in the repository Settings → Secrets → Actions. The workflow and start script expect the token to be available as the secret name `DISCORD_TOKEN`.

Optional secrets you may need (add these if your bot uses them):
- OPENAI_API_KEY
- DATABASE_URL

How to run
1. Add the required secrets (at minimum: `DISCORD_TOKEN`) at: https://github.com/ncjknckwdcmdcmdkvndj-collab/Discord-Memory-Bot/settings/secrets/actions
2. Go to the repository's Actions tab, select the "Run Discord Bot (manual)" workflow, and click "Run workflow".

Notes and limitations
- GitHub-hosted Actions runners are ephemeral. The workflow will run as long as the job is active (up to the runner time limit). This is suitable for testing and short-lived runs, but not for a 24/7 bot. For continuous operation, deploy to a VPS, Render, Railway, Heroku, or use a self-hosted runner.
- The workflow expects your project to have appropriate npm scripts in `package.json`:
  - `build` (optional) — compiles TypeScript, e.g. `tsc`.
  - `start` (required) — starts the bot, e.g. `node ./dist/index.js` or `ts-node src/index.ts`.

If you want, I can also update `package.json` scripts in this branch to add `build`/`start` defaults if they are missing — tell me and I will update them.
