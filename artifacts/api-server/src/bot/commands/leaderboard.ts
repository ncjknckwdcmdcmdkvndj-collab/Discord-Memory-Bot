import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  Colors,
} from "discord.js";
import { db } from "@workspace/db";
import { membersTable, missionClaimsTable, guildsTable } from "@workspace/db";
import { eq, desc, and, gte } from "drizzle-orm";
import { getGuildRanks, calculateRank } from "../utils/ranks";

export const data = new SlashCommandBuilder()
  .setName("leaderboard")
  .setDescription("View server leaderboards")
  .addStringOption((o) =>
    o
      .setName("category")
      .setDescription("Leaderboard category")
      .addChoices(
        { name: "Most Completed Missions", value: "completed" },
        { name: "Highest Completion Rate", value: "rate" },
        { name: "Most Missions Abandoned", value: "abandoned" },
        { name: "Longest Streak", value: "streak" },
        { name: "This Week", value: "week" },
        { name: "This Month", value: "month" },
        { name: "Highest Rank", value: "rank" },
      ),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const guildId = interaction.guildId!;
  const category = interaction.options.getString("category") ?? "completed";

  await interaction.deferReply();

  await db.insert(guildsTable).values({ guildId }).onConflictDoNothing();

  const ranks = await getGuildRanks(guildId);

  let embed: EmbedBuilder;

  if (category === "week" || category === "month") {
    const now = new Date();
    const cutoff = new Date();
    if (category === "week") {
      cutoff.setDate(now.getDate() - 7);
    } else {
      cutoff.setMonth(now.getMonth() - 1);
    }

    const claims = await db
      .select()
      .from(missionClaimsTable)
      .where(
        and(
          eq(missionClaimsTable.guildId, guildId),
          eq(missionClaimsTable.status, "completed"),
          gte(missionClaimsTable.completedAt, cutoff),
        ),
      );

    const countByUser: Record<string, number> = {};
    for (const c of claims) {
      countByUser[c.userId] = (countByUser[c.userId] ?? 0) + 1;
    }

    const sorted = Object.entries(countByUser)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10);

    const period = category === "week" ? "This Week" : "This Month";
    embed = new EmbedBuilder()
      .setTitle(`🏆 Leaderboard — ${period}`)
      .setColor(Colors.Gold);

    if (sorted.length === 0) {
      embed.setDescription("No completions in this period.");
    } else {
      embed.setDescription(
        sorted
          .map(([uid, count], i) => `**${i + 1}.** <@${uid}> — ${count} missions`)
          .join("\n"),
      );
    }
  } else if (category === "completed") {
    const top = await db
      .select()
      .from(membersTable)
      .where(eq(membersTable.guildId, guildId))
      .orderBy(desc(membersTable.completedMissions))
      .limit(10);

    embed = new EmbedBuilder()
      .setTitle("🏆 Leaderboard — Most Completed")
      .setColor(Colors.Gold)
      .setDescription(
        top.length === 0
          ? "No data yet."
          : top
              .map(
                (m, i) =>
                  `**${i + 1}.** <@${m.userId}> — ${m.completedMissions} completed`,
              )
              .join("\n"),
      );
  } else if (category === "rate") {
    const all = await db
      .select()
      .from(membersTable)
      .where(eq(membersTable.guildId, guildId));

    const withRate = all
      .filter((m) => m.totalAccepted >= 3) // min 3 accepted to appear
      .map((m) => ({
        ...m,
        rate:
          m.totalAccepted > 0
            ? (m.completedMissions / m.totalAccepted) * 100
            : 0,
      }))
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 10);

    embed = new EmbedBuilder()
      .setTitle("🏆 Leaderboard — Highest Completion Rate")
      .setColor(Colors.Gold)
      .setDescription(
        withRate.length === 0
          ? "No data yet (requires at least 3 accepted missions)."
          : withRate
              .map(
                (m, i) =>
                  `**${i + 1}.** <@${m.userId}> — ${m.rate.toFixed(1)}%`,
              )
              .join("\n"),
      );
  } else if (category === "streak") {
    const top = await db
      .select()
      .from(membersTable)
      .where(eq(membersTable.guildId, guildId))
      .orderBy(desc(membersTable.longestStreak))
      .limit(10);

    embed = new EmbedBuilder()
      .setTitle("🏆 Leaderboard — Longest Streak")
      .setColor(Colors.Gold)
      .setDescription(
        top.length === 0
          ? "No data yet."
          : top
              .map(
                (m, i) =>
                  `**${i + 1}.** <@${m.userId}> — ${m.longestStreak} day(s)`,
              )
              .join("\n"),
      );
  } else if (category === "abandoned") {
    const top = await db
      .select()
      .from(membersTable)
      .where(eq(membersTable.guildId, guildId))
      .orderBy(desc(membersTable.missionsAbandoned))
      .limit(10);

    embed = new EmbedBuilder()
      .setTitle("🏆 Leaderboard — Most Abandoned")
      .setColor(Colors.Orange)
      .setDescription(
        top.length === 0
          ? "No data yet."
          : top
              .map(
                (m, i) =>
                  `**${i + 1}.** <@${m.userId}> — ${m.missionsAbandoned} abandoned`,
              )
              .join("\n"),
      );
  } else if (category === "rank") {
    if (ranks.length === 0) {
      return interaction.editReply("No ranks configured. Use `/rank add` to set up ranks.");
    }

    const all = await db
      .select()
      .from(membersTable)
      .where(eq(membersTable.guildId, guildId));

    const withRank = all
      .map((m) => ({
        ...m,
        rank: calculateRank(m.completedMissions, ranks),
      }))
      .filter((m) => m.rank !== null)
      .sort((a, b) => (b.rank!.rankOrder) - (a.rank!.rankOrder))
      .slice(0, 10);

    embed = new EmbedBuilder()
      .setTitle("🏆 Leaderboard — Highest Rank")
      .setColor(Colors.Gold)
      .setDescription(
        withRank.length === 0
          ? "No ranked members yet."
          : withRank
              .map(
                (m, i) =>
                  `**${i + 1}.** <@${m.userId}> — ${m.rank!.rankName} (${m.completedMissions} missions)`,
              )
              .join("\n"),
      );
  } else {
    embed = new EmbedBuilder()
      .setTitle("Leaderboard")
      .setDescription("Unknown category.");
  }

  embed.setTimestamp().setFooter({ text: interaction.guild!.name });

  return interaction.editReply({ embeds: [embed] });
}
