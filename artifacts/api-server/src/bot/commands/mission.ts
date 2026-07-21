import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChatInputCommandInteraction,
  EmbedBuilder,
  Colors,
  TextChannel,
} from "discord.js";
import { db } from "@workspace/db";
import {
  missionsTable,
  rankConfigsTable,
  guildsTable,
  missionClaimsTable,
} from "@workspace/db";
import { eq, and, asc, inArray } from "drizzle-orm";
import { missionBoardEmbed, missionBoardRow } from "../utils/embeds";
import { getGuildRanks } from "../utils/ranks";

export const data = new SlashCommandBuilder()
  .setName("mission")
  .setDescription("Manage missions")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub
      .setName("add")
      .setDescription("Create a new mission")
      .addStringOption((o) =>
        o.setName("title").setDescription("Mission title").setRequired(true),
      )
      .addStringOption((o) =>
        o
          .setName("description")
          .setDescription("Short summary shown on the Mission Board")
          .setRequired(true),
      )
      .addStringOption((o) =>
        o
          .setName("details")
          .setDescription("Extended instructions sent to the player on acceptance")
          .setRequired(true),
      )
      .addIntegerOption((o) =>
        o
          .setName("min_rank")
          .setDescription("Minimum rank required to claim (leave blank = anyone can claim)")
          .setAutocomplete(true)
          .setMinValue(0),
      )
      .addIntegerOption((o) =>
        o
          .setName("max_rank")
          .setDescription("Maximum rank allowed to claim (leave blank = no upper limit)")
          .setAutocomplete(true)
          .setMinValue(0),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("list")
      .setDescription("List all active missions in this server"),
  )
  .addSubcommand((sub) =>
    sub
      .setName("remove")
      .setDescription("Remove a mission (will not affect active claims)")
      .addIntegerOption((o) =>
        o
          .setName("id")
          .setDescription("Mission ID to remove")
          .setRequired(true),
      ),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const guildId = interaction.guildId!;
  const sub = interaction.options.getSubcommand();

  await db.insert(guildsTable).values({ guildId }).onConflictDoNothing();

  if (sub === "add") {
    const title = interaction.options.getString("title", true);
    const description = interaction.options.getString("description", true);
    const finerDetails = interaction.options.getString("details", true);
    const minRankOrder = interaction.options.getInteger("min_rank") ?? 0;
    const maxRankOrder = interaction.options.getInteger("max_rank") ?? null;

    const [guild] = await db
      .select()
      .from(guildsTable)
      .where(eq(guildsTable.guildId, guildId));

    if (!guild?.missionBoardChannelId) {
      return interaction.reply({
        content:
          "❌ No Mission Board channel configured. Use `/setup board <channel>` first.",
        ephemeral: true,
      });
    }

    // Validate rank orders
    const ranks = await getGuildRanks(guildId);
    const minRank = ranks.find((r) => r.rankOrder === minRankOrder);
    if (minRankOrder > 0 && ranks.length > 0 && !minRank) {
      return interaction.reply({
        content: `❌ No rank found with order **${minRankOrder}**. Use \`/rank list\` to see valid orders.`,
        ephemeral: true,
      });
    }

    const maxRank = maxRankOrder != null ? ranks.find((r) => r.rankOrder === maxRankOrder) : null;
    if (maxRankOrder != null && ranks.length > 0 && !maxRank) {
      return interaction.reply({
        content: `❌ No rank found with order **${maxRankOrder}**. Use \`/rank list\` to see valid orders.`,
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    const [mission] = await db
      .insert(missionsTable)
      .values({
        guildId,
        title,
        description,
        finerDetails,
        minRankOrder,
        maxRankOrder,
        createdByUserId: interaction.user.id,
      })
      .returning();

    // Post to mission board
    const boardChannel = interaction.guild!.channels.cache.get(
      guild.missionBoardChannelId,
    ) as TextChannel | undefined;

    if (!boardChannel) {
      return interaction.editReply(
        "⚠️ Mission created but the Mission Board channel could not be found. Please re-run `/setup board`.",
      );
    }

    const embed = missionBoardEmbed(
      mission,
      minRank?.rankName ?? `Order ${minRankOrder}`,
      maxRank?.rankName ?? (maxRankOrder != null ? `Order ${maxRankOrder}` : null),
      null,
    );
    const row = missionBoardRow(mission.id);
    const boardMsg = await boardChannel.send({ embeds: [embed], components: [row] });

    await db
      .update(missionsTable)
      .set({ boardMessageId: boardMsg.id })
      .where(eq(missionsTable.id, mission.id));

    return interaction.editReply(
      `✅ Mission **${title}** created and posted to <#${guild.missionBoardChannelId}> (ID: ${mission.id})`,
    );
  }

  if (sub === "list") {
    const missions = await db
      .select()
      .from(missionsTable)
      .where(
        and(
          eq(missionsTable.guildId, guildId),
          eq(missionsTable.status, "available"),
        ),
      )
      .orderBy(asc(missionsTable.id));

    if (missions.length === 0) {
      return interaction.reply({
        content: "No active missions. Use `/mission add` to create one.",
        ephemeral: true,
      });
    }

    const ranks = await getGuildRanks(guildId);
    const rankMap = Object.fromEntries(ranks.map((r) => [r.rankOrder, r.rankName]));

    const embed = new EmbedBuilder()
      .setTitle("📋 Active Missions")
      .setColor(Colors.Blue)
      .setDescription(
        missions
          .map(
            (m) =>
              `**#${m.id}** · ${m.title}\nMin: ${rankMap[m.minRankOrder] ?? `Order ${m.minRankOrder}`}${m.maxRankOrder != null ? ` · Max: ${rankMap[m.maxRankOrder] ?? `Order ${m.maxRankOrder}`}` : ""}`,
          )
          .join("\n\n"),
      );

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  if (sub === "remove") {
    const id = interaction.options.getInteger("id", true);

    const [mission] = await db
      .select()
      .from(missionsTable)
      .where(and(eq(missionsTable.id, id), eq(missionsTable.guildId, guildId)));

    if (!mission) {
      return interaction.reply({
        content: `❌ Mission #${id} not found.`,
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    // Disable board message
    if (mission.boardMessageId) {
      const [guild] = await db
        .select()
        .from(guildsTable)
        .where(eq(guildsTable.guildId, guildId));
      if (guild?.missionBoardChannelId) {
        try {
          const ch = interaction.guild!.channels.cache.get(
            guild.missionBoardChannelId,
          ) as TextChannel | undefined;
          if (ch) {
            const msg = await ch.messages.fetch(mission.boardMessageId).catch(() => null);
            if (msg) {
              await msg.edit({
                components: [missionBoardRow(mission.id, true)],
              });
            }
          }
        } catch {
          // Ignore
        }
      }
    }

    await db
      .update(missionsTable)
      .set({ status: "deleted" })
      .where(eq(missionsTable.id, id));

    return interaction.editReply(`✅ Mission **${mission.title}** (#${id}) removed.`);
  }

  return interaction.reply({ content: "Unknown subcommand.", ephemeral: true });
}
