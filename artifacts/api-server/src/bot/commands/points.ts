import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChatInputCommandInteraction,
} from "discord.js";
import { db } from "@workspace/db";
import { membersTable, guildsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { ensureMember, getGuildRanks, syncMemberRoles } from "../utils/ranks";

export const data = new SlashCommandBuilder()
  .setName("points")
  .setDescription("Manually adjust a member's completed mission count")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub
      .setName("adjust")
      .setDescription("Add or subtract completed mission points")
      .addUserOption((o) =>
        o.setName("user").setDescription("Target member").setRequired(true),
      )
      .addIntegerOption((o) =>
        o
          .setName("amount")
          .setDescription("Amount to add (negative to subtract)")
          .setRequired(true),
      )
      .addStringOption((o) =>
        o.setName("reason").setDescription("Reason for adjustment"),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("set")
      .setDescription("Set a member's completed mission count to an exact value")
      .addUserOption((o) =>
        o.setName("user").setDescription("Target member").setRequired(true),
      )
      .addIntegerOption((o) =>
        o
          .setName("value")
          .setDescription("New completed mission count")
          .setRequired(true)
          .setMinValue(0),
      )
      .addStringOption((o) =>
        o.setName("reason").setDescription("Reason for adjustment"),
      ),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const guildId = interaction.guildId!;
  const sub = interaction.options.getSubcommand();
  const target = interaction.options.getUser("user", true);
  const reason = interaction.options.getString("reason") ?? "No reason provided";

  await db.insert(guildsTable).values({ guildId }).onConflictDoNothing();
  await interaction.deferReply({ ephemeral: true });

  const memberRecord = await ensureMember(guildId, target.id);

  let newValue: number;

  if (sub === "adjust") {
    const amount = interaction.options.getInteger("amount", true);
    newValue = Math.max(0, memberRecord.completedMissions + amount);
  } else {
    newValue = interaction.options.getInteger("value", true);
  }

  await db
    .update(membersTable)
    .set({ completedMissions: newValue })
    .where(and(eq(membersTable.guildId, guildId), eq(membersTable.userId, target.id)));

  // Sync roles
  const guildMember = await interaction.guild!.members.fetch(target.id).catch(() => null);
  if (guildMember) {
    await syncMemberRoles(guildMember, guildId, newValue);
  }

  const delta = newValue - memberRecord.completedMissions;
  const deltaStr = delta >= 0 ? `+${delta}` : String(delta);

  return interaction.editReply(
    [
      `✅ **${target.displayName ?? target.username}**'s completed missions updated.`,
      `Before: **${memberRecord.completedMissions}** → After: **${newValue}** (${deltaStr})`,
      `Reason: ${reason}`,
    ].join("\n"),
  );
}
