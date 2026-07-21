import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChatInputCommandInteraction,
  EmbedBuilder,
  Colors,
} from "discord.js";
import { db } from "@workspace/db";
import { rankConfigsTable, guildsTable } from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";

export const data = new SlashCommandBuilder()
  .setName("rank")
  .setDescription("Manage progression ranks for this server")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((sub) =>
    sub
      .setName("add")
      .setDescription("Add a new rank tier")
      .addStringOption((opt) =>
        opt.setName("name").setDescription("Rank name").setRequired(true),
      )
      .addIntegerOption((opt) =>
        opt
          .setName("missions")
          .setDescription("Number of completed missions required")
          .setRequired(true)
          .setMinValue(0),
      )
      .addIntegerOption((opt) =>
        opt
          .setName("order")
          .setDescription("Rank order (higher = higher rank). Used for mission tier restrictions.")
          .setRequired(true)
          .setMinValue(0),
      )
      .addRoleOption((opt) =>
        opt.setName("role").setDescription("Discord role to assign (optional)"),
      ),
  )
  .addSubcommand((sub) =>
    sub.setName("list").setDescription("List all configured ranks"),
  )
  .addSubcommand((sub) =>
    sub
      .setName("remove")
      .setDescription("Remove a rank tier")
      .addIntegerOption((opt) =>
        opt
          .setName("id")
          .setDescription("Rank config ID (shown in /rank list)")
          .setRequired(true),
      ),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const guildId = interaction.guildId!;
  const sub = interaction.options.getSubcommand();

  // Ensure guild exists
  await db.insert(guildsTable).values({ guildId }).onConflictDoNothing();

  if (sub === "add") {
    const name = interaction.options.getString("name", true);
    const missions = interaction.options.getInteger("missions", true);
    const order = interaction.options.getInteger("order", true);
    const role = interaction.options.getRole("role");

    // Check for duplicate order or missions_required
    const existing = await db
      .select()
      .from(rankConfigsTable)
      .where(
        and(
          eq(rankConfigsTable.guildId, guildId),
          eq(rankConfigsTable.rankOrder, order),
        ),
      );
    if (existing.length > 0) {
      return interaction.reply({
        content: `❌ A rank with order **${order}** already exists: **${existing[0].rankName}**. Use a different order value.`,
        ephemeral: true,
      });
    }

    await db.insert(rankConfigsTable).values({
      guildId,
      rankName: name,
      rankOrder: order,
      missionsRequired: missions,
      roleId: role?.id ?? null,
    });

    return interaction.reply({
      content: `✅ Rank **${name}** added (order: ${order}, requires ${missions} completions${role ? `, role: <@&${role.id}>` : ""})`,
      ephemeral: true,
    });
  }

  if (sub === "list") {
    const ranks = await db
      .select()
      .from(rankConfigsTable)
      .where(eq(rankConfigsTable.guildId, guildId))
      .orderBy(asc(rankConfigsTable.missionsRequired));

    if (ranks.length === 0) {
      return interaction.reply({
        content: "No ranks configured yet. Use `/rank add` to create ranks.",
        ephemeral: true,
      });
    }

    const embed = new EmbedBuilder()
      .setTitle("🏅 Rank Tiers")
      .setColor(Colors.Gold)
      .setDescription(
        ranks
          .map(
            (r) =>
              `**ID ${r.id}** · Order ${r.rankOrder} · **${r.rankName}** — ${r.missionsRequired} missions${r.roleId ? ` · <@&${r.roleId}>` : ""}`,
          )
          .join("\n"),
      );

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  if (sub === "remove") {
    const id = interaction.options.getInteger("id", true);
    const deleted = await db
      .delete(rankConfigsTable)
      .where(
        and(eq(rankConfigsTable.id, id), eq(rankConfigsTable.guildId, guildId)),
      )
      .returning();

    if (deleted.length === 0) {
      return interaction.reply({
        content: `❌ Rank with ID **${id}** not found.`,
        ephemeral: true,
      });
    }

    return interaction.reply({
      content: `✅ Rank **${deleted[0].rankName}** removed.`,
      ephemeral: true,
    });
  }

  return interaction.reply({ content: "Unknown subcommand.", ephemeral: true });
}
