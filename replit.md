# Mission & Progression Discord Bot

A fully customizable mission system that keeps Discord communities active, organized, and rewarded. Members complete missions, earn ranks, and compete on leaderboards — all managed through Discord slash commands.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API + Discord bot (port 8080)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string (auto-provisioned)
- Required secret: `DISCORD_BOT_TOKEN` — your bot token from discord.com/developers

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Discord: discord.js v14
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/api-server/src/bot/` — all Discord bot code
  - `index.ts` — client setup, event handlers, command registration
  - `commands/` — slash command handlers (setup, rank, mission, profile, leaderboard, points)
  - `interactions/` — button & modal handlers (accept, unaccept, submit, review)
  - `utils/embeds.ts` — Discord embed builders
  - `utils/ranks.ts` — rank calculation, streak, role sync helpers
- `lib/db/src/schema/` — Drizzle table definitions
  - `guilds.ts` — per-server config (board channel, review channel)
  - `rankConfigs.ts` — configurable rank tiers with Discord role IDs
  - `missions.ts` — mission definitions
  - `missionClaims.ts` — per-user claim lifecycle + proof storage
  - `members.ts` — member stats, streaks, rank breakdowns

## Bot Commands

### Admin commands (require Manage Guild)
| Command | Description |
|---|---|
| `/setup board #channel` | Set the public Mission Board channel |
| `/setup review #channel` | Set the private staff review channel |
| `/setup status` | Show current configuration |
| `/rank add <name> <missions> <order> [role]` | Create a rank tier |
| `/rank list` | List all rank tiers |
| `/rank remove <id>` | Delete a rank tier |
| `/mission add <title> <desc> <details> <min_rank> [max_rank]` | Create & post a mission |
| `/mission list` | List all active missions |
| `/mission remove <id>` | Remove a mission |
| `/points adjust <user> <amount> [reason]` | Add/subtract completed mission points |
| `/points set <user> <value> [reason]` | Set exact completed mission count |

### Member commands
| Command | Description |
|---|---|
| `/profile [user]` | View mission stats and rank |
| `/leaderboard [category]` | Server leaderboards |

### Leaderboard categories
Most Completed · Highest Completion Rate · Longest Streak · Most Abandoned · This Week · This Month · Highest Rank

## Mission Flow

1. Staff creates mission with `/mission add` → posted to Mission Board with **Accept Mission** button
2. Member clicks **Accept Mission** → bot DMs them full details + **Submit Mission** + **Abandon Mission** buttons
3. Member sends proof in DM, then clicks **Submit Mission** → post appears in review channel
4. Staff clicks ✅ **Accept** or ❌ **Deny** (with optional reason) in review channel
5. On accept: member stats updated, rank roles synced, member notified via DM

## Architecture decisions

- The Discord bot runs inside the same Express process — no separate worker needed
- Slash commands are registered globally on bot startup (takes ~1 hour to propagate to all servers on first deploy; guild-scoped commands are instant but per-server)
- Mission claims store proof as JSONB (messages sent by the user in the DM channel between claim and submit)
- Board messages are updated in-place (claimed/available state), not re-posted, to preserve message history
- Rank roles are cumulative — a member keeps all roles at or below their current rank tier

## Gotchas

- The bot needs **Server Members Intent** and **Message Content Intent** enabled on discord.com/developers
- DM proof collection only captures messages sent after the initial bot DM. If a user has DMs disabled, claim still works but proof will be empty.
- Global slash command registration can take up to 1 hour on the first invite. Use Discord's guild-scoped registration for immediate testing.
- Bot needs **Manage Roles** permission and its role must be above any rank roles it assigns.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
