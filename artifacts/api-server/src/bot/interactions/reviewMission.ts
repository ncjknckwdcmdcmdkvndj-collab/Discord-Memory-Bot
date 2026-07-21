import {
  ButtonInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ModalSubmitInteraction,
  TextChannel,
} from "discord.js";
import { db } from "@workspace/db";
import {
  missionClaimsTable,
  missionsTable,
  membersTable,
  guildsTable,
  rankConfigsTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { missionBoardEmbed, missionBoardRow } from "../utils/embeds";
import {
  ensureMember,
  getGuildRanks,
  syncMemberRoles,
  computeStreak,
  calculateRank,
} from "../utils/ranks";

export async function handleApproveSubmission(
  interaction: ButtonInteraction,
  claimId: number,
) {
  await interaction.deferUpdate();

  const [claim] = await db
    .select()
    .from(missionClaimsTable)
    .where(eq(missionClaimsTable.id, claimId));

  if (!claim || claim.status !== "submitted") {
    return interaction.followUp({
      content: "❌ This submission is no longer pending review.",
      ephemeral: true,
    });
  }

  const [mission] = await db
    .select()
    .from(missionsTable)
    .where(eq(missionsTable.id, claim.missionId));

  if (!mission) {
    return interaction.followUp({ content: "❌ Mission not found.", ephemeral: true });
  }

  const now = new Date();

  // Update claim
  await db
    .update(missionClaimsTable)
    .set({ status: "completed", completedAt: now })
    .where(eq(missionClaimsTable.id, claimId));

  // Update member stats
  const member = await ensureMember(claim.guildId, claim.userId);

  const { newStreak, newLongest, todayStr } = computeStreak(
    member.lastCompletedDate,
    member.currentStreak,
    member.longestStreak,
  );

  // Track per-rank completions
  const rankStats = { ...(member.rankStats ?? {}) };
  const tierKey = String(mission.minRankOrder);
  rankStats[tierKey] = (rankStats[tierKey] ?? 0) + 1;

  const newCompleted = member.completedMissions + 1;

  await db
    .update(membersTable)
    .set({
      completedMissions: newCompleted,
      rankStats,
      currentStreak: newStreak,
      longestStreak: newLongest,
      lastCompletedDate: todayStr,
      lastCompletedAt: now,
      firstCompletedAt: member.firstCompletedAt ?? now,
    })
    .where(
      and(
        eq(membersTable.guildId, claim.guildId),
        eq(membersTable.userId, claim.userId),
      ),
    );

  // Sync Discord roles
  const guildObj = interaction.client.guilds.cache.get(claim.guildId);
  if (guildObj) {
    const guildMember = await guildObj.members.fetch(claim.userId).catch(() => null);
    if (guildMember) {
      await syncMemberRoles(guildMember, claim.guildId, newCompleted);
    }
  }

  // Determine new rank for notification
  const ranks = await getGuildRanks(claim.guildId);
  const newRank = calculateRank(newCompleted, ranks);
  const oldRank = calculateRank(member.completedMissions, ranks);
  const rankUpMsg =
    newRank && newRank.rankOrder !== (oldRank?.rankOrder ?? -1)
      ? `\n🎉 You've ranked up to **${newRank.rankName}**!`
      : "";

  // Notify the member via DM
  try {
    const user = await interaction.client.users.fetch(claim.userId).catch(() => null);
    if (user) {
      await user.send(
        `✅ **Mission Approved!**\n\nYour submission for **${mission.title}** has been approved by staff.\nYou now have **${newCompleted}** completed mission(s).${rankUpMsg}`,
      );
    }
  } catch {
    // DMs may be disabled
  }

  // Restore mission board (mission stays available for others)
  if (mission.boardMessageId && mission.status === "available") {
    const [guild] = await db
      .select()
      .from(guildsTable)
      .where(eq(guildsTable.guildId, claim.guildId));
    if (guild?.missionBoardChannelId && guildObj) {
      try {
        const ch = guildObj.channels.cache.get(
          guild.missionBoardChannelId,
        ) as TextChannel | undefined;
        if (ch) {
          const msg = await ch.messages.fetch(mission.boardMessageId).catch(() => null);
          if (msg) {
            const minRank = ranks.find((r) => r.rankOrder === mission.minRankOrder);
            const maxRank = mission.maxRankOrder != null
              ? ranks.find((r) => r.rankOrder === mission.maxRankOrder)
              : null;
            await msg.edit({
              embeds: [
                missionBoardEmbed(
                  mission,
                  minRank?.rankName ?? `Order ${mission.minRankOrder}`,
                  maxRank?.rankName ?? (mission.maxRankOrder != null ? `Order ${mission.maxRankOrder}` : null),
                  null,
                ),
              ],
              components: [missionBoardRow(mission.id, false)],
            });
          }
        }
      } catch {
        // Best-effort
      }
    }
  }

  // Update review message
  try {
    await interaction.message.edit({
      content: `✅ **Approved** by <@${interaction.user.id}>`,
      components: [],
    });
  } catch {
    // Already handled
  }

  await interaction.followUp({
    content: `✅ Submission approved for <@${claim.userId}>. They've been notified.`,
    ephemeral: true,
  });
  return;
}

export async function handleDenySubmission(
  interaction: ButtonInteraction,
  claimId: number,
) {
  // Show a modal to collect the denial reason
  const modal = new ModalBuilder()
    .setCustomId(`deny_modal:${claimId}`)
    .setTitle("Deny Mission Submission");

  const reasonInput = new TextInputBuilder()
    .setCustomId("reason")
    .setLabel("Reason for denial (optional)")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("Explain why this submission was denied...")
    .setRequired(false)
    .setMaxLength(500);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput),
  );

  await interaction.showModal(modal);
}

export async function handleDenyModal(
  interaction: ModalSubmitInteraction,
  claimId: number,
) {
  await interaction.deferUpdate();

  const reason =
    interaction.fields.getTextInputValue("reason") || "No reason provided.";

  const [claim] = await db
    .select()
    .from(missionClaimsTable)
    .where(eq(missionClaimsTable.id, claimId));

  if (!claim || claim.status !== "submitted") {
    return interaction.followUp({
      content: "❌ This submission is no longer pending.",
      ephemeral: true,
    });
  }

  const [mission] = await db
    .select()
    .from(missionsTable)
    .where(eq(missionsTable.id, claim.missionId));

  // Update claim
  await db
    .update(missionClaimsTable)
    .set({ status: "denied", denialReason: reason })
    .where(eq(missionClaimsTable.id, claimId));

  // Update member denied count
  const member = await ensureMember(claim.guildId, claim.userId);
  await db
    .update(membersTable)
    .set({ totalDenied: member.totalDenied + 1 })
    .where(
      and(
        eq(membersTable.guildId, claim.guildId),
        eq(membersTable.userId, claim.userId),
      ),
    );

  // Notify member
  try {
    const user = await interaction.client.users.fetch(claim.userId).catch(() => null);
    if (user) {
      await user.send(
        `❌ **Mission Denied**\n\nYour submission for **${mission?.title ?? "a mission"}** was denied by staff.\n**Reason:** ${reason}`,
      );
    }
  } catch {
    // DMs disabled
  }

  // Restore mission board
  if (mission?.boardMessageId && mission.status === "available") {
    const [guild] = await db
      .select()
      .from(guildsTable)
      .where(eq(guildsTable.guildId, claim.guildId));
    if (guild?.missionBoardChannelId) {
      try {
        const guildObj = interaction.client.guilds.cache.get(claim.guildId);
        if (guildObj) {
          const ch = guildObj.channels.cache.get(
            guild.missionBoardChannelId,
          ) as TextChannel | undefined;
          if (ch) {
            const msg = await ch.messages.fetch(mission.boardMessageId!).catch(() => null);
            if (msg) {
              const ranks = await getGuildRanks(claim.guildId);
              const minRank = ranks.find((r) => r.rankOrder === mission.minRankOrder);
              const maxRank = mission.maxRankOrder != null
                ? ranks.find((r) => r.rankOrder === mission.maxRankOrder)
                : null;
              await msg.edit({
                embeds: [
                  missionBoardEmbed(
                    mission,
                    minRank?.rankName ?? `Order ${mission.minRankOrder}`,
                    maxRank?.rankName ?? (mission.maxRankOrder != null ? `Order ${mission.maxRankOrder}` : null),
                    null,
                  ),
                ],
                components: [missionBoardRow(mission.id, false)],
              });
            }
          }
        }
      } catch {
        // Best-effort
      }
    }
  }

  // Update review message
  try {
    await interaction.message?.edit({
      content: `❌ **Denied** by <@${interaction.user.id}> — ${reason}`,
      components: [],
    });
  } catch {
    // Already handled
  }

  await interaction.followUp({
    content: `❌ Submission denied. <@${claim.userId}> has been notified.`,
    ephemeral: true,
  });
  return;
}
