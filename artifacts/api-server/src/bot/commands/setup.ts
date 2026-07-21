import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChatInputCommandInteraction,
  ChannelType,
} from "discord.js";
import { db } from "@workspace/db";
import { guildsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export const data = new SlashCommandBuilder()
  .setName("setup")
  .setDescription("Configure the mission bot for this server")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((sub) =>
    sub
      .setName("board")
      .setDescription("Set the Mission Board channel")
      .addChannelOption((opt) =>
        opt
          .setName("channel")
          .setDescription("Channel to post missions in")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("review")
      .setDescription("Set the private Mission Review channel")
      .addChannelOption((opt) =>
        opt
          .setName("channel")
          .setDescription("Private channel for staff to review submissions")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub.setName("status").setDescription("Show current bot configuration"),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const guildId = interaction.guildId!;
  const sub = interaction.options.getSubcommand();

  // Ensure guild record exists
  await db
    .insert(guildsTable)
    .values({ guildId })
    .onConflictDoNothing();

  if (sub === "board") {
    const channel = interaction.options.getChannel("channel", true);
    await db
      .update(guildsTable)
      .set({ missionBoardChannelId: channel.id, updatedAt: new Date() })
      .where(eq(guildsTable.guildId, guildId));
    return interaction.reply({
      content: `✅ Mission Board set to <#${channel.id}>`,
      ephemeral: true,
    });
  }

  if (sub === "review") {
    const channel = interaction.options.getChannel("channel", true);
    await db
      .update(guildsTable)
      .set({ reviewChannelId: channel.id, updatedAt: new Date() })
      .where(eq(guildsTable.guildId, guildId));
    return interaction.reply({
      content: `✅ Mission Review channel set to <#${channel.id}>`,
      ephemeral: true,
    });
  }

  if (sub === "status") {
    const [guild] = await db
      .select()
      .from(guildsTable)
      .where(eq(guildsTable.guildId, guildId));
    if (!guild) {
      return interaction.reply({
        content: "⚠️ Bot not configured yet. Use `/setup board` and `/setup review`.",
        ephemeral: true,
      });
    }
    return interaction.reply({
      content: [
        "**Bot Configuration:**",
        `📋 Mission Board: ${guild.missionBoardChannelId ? `<#${guild.missionBoardChannelId}>` : "Not set"}`,
        `🔍 Review Channel: ${guild.reviewChannelId ? `<#${guild.reviewChannelId}>` : "Not set"}`,
      ].join("\n"),
      ephemeral: true,
    });
  }

  return interaction.reply({ content: "Unknown subcommand.", ephemeral: true });
}
