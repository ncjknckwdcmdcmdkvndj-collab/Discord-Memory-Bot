import {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
} from "discord.js";
import { commandMap, commands } from "./commands";
import { handleInteraction } from "./interactions";
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
