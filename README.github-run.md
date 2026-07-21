Instructions to run this bot via GitHub Actions

1. Add required repository secrets:
   - DISCORD_TOKEN
   - (optional) OPENAI_API_KEY, DATABASE_URL, etc.

2. Go to Actions → Run Discord Bot (manual) and click "Run workflow".

Notes:
- A workflow run will run the bot while the Actions job is active; Actions runners are ephemeral and have time limits. For a reliable always-on bot, deploy to a hosted service or a self-hosted runner.
