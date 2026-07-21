import {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
} from "discord.js";
import { commandMap, commands } from "./commands";
import { handleInteraction } from "./interactions";
import { getGuildRanks } from "./utils/ranks";
import { logger } from "../lib/logger";

export function createBot(): Client {
  const token = process.env["DISCORD_BOT_TOKEN"];
  if (!token) {
    throw new Error("DISCORD_BOT_TOKEN environment variable is required.");
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
    ],
    partials: [Partials.Channel, Partials.Message],
  });

  // ── Ready ────────────────────────────────────────────────────────────────
  client.once("ready", async (c) => {
    logger.info(`Discord bot logged in as ${c.user.tag}`);

    const inviteUrl =
      `https://discord.com/api/oauth2/authorize` +
      `?client_id=${c.user.id}` +
      `&permissions=275951575040` +
      `&scope=bot%20applications.commands`;
    logger.info(`Bot invite URL: ${inviteUrl}`);
    // Store on client for the API route
    (c as typeof c & { inviteUrl: string }).inviteUrl = inviteUrl;

    // Register slash commands globally
    const rest = new REST().setToken(token);
    try {
      await rest.put(Routes.applicationCommands(c.user.id), {
        body: commands.map((cmd) => cmd.data.toJSON()),
      });
      logger.info("Slash commands registered globally.");
    } catch (err) {
      logger.error({ err }, "Failed to register slash commands.");
    }
  });

  // ── Slash commands ───────────────────────────────────────────────────────
  client.on("interactionCreate", async (interaction) => {
    // Autocomplete: rank options on /mission add
    if (interaction.isAutocomplete()) {
      const focused = interaction.options.getFocused(true);
      if (
        interaction.commandName === "mission" &&
        (focused.name === "min_rank" || focused.name === "max_rank")
      ) {
        const guildId = interaction.guildId;
        if (!guildId) return interaction.respond([]);

        const ranks = await getGuildRanks(guildId).catch((): import("@workspace/db").RankConfig[] => []);
        const query = String(focused.value).toLowerCase();

        const choices = ranks
          .filter((r) =>
            query === "" || r.rankName.toLowerCase().includes(query),
          )
          .slice(0, 25)
          .map((r) => ({
            name: `${r.rankName} (${r.missionsRequired} missions required)`,
            value: r.rankOrder,
          }));

        return interaction.respond(choices);
      }
      return interaction.respond([]);
    }

    if (interaction.isChatInputCommand()) {
      const command = commandMap.get(interaction.commandName);
      if (!command) return;
      try {
        await command.execute(interaction);
      } catch (err) {
        logger.error({ err, command: interaction.commandName }, "Command error");
        const errMsg = {
          content: "⚠️ An error occurred while running this command.",
          ephemeral: true,
        };
        try {
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp(errMsg);
          } else {
            await interaction.reply(errMsg);
          }
        } catch {
          // Ignore
        }
      }
      return;
    }

    // Buttons & Modals
    await handleInteraction(interaction);
  });

  // ── Login ────────────────────────────────────────────────────────────────
  client.login(token).catch((err) => {
    logger.error({ err }, "Discord bot login failed.");
    process.exit(1);
  });

  return client;
}
