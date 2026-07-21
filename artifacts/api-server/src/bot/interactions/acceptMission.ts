import {
  ButtonInteraction,
  TextChannel,
} from "discord.js";
import { db } from "@workspace/db";
import {
  missionsTable,
  missionClaimsTable,
  membersTable,
  guildsTable,
  rankConfigsTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { missionBoardEmbed, missionBoardRow, missionDmEmbed, missionDmRow } from "../utils/embeds";
import { getGuildRanks, ensureMember, calculateRank } from "../utils/ranks";

export async function handleAcceptMission(interaction: ButtonInteraction, missionId: number) {
  const guildId = interaction.guildId!;
  const userId = interaction.user.id;

  await interaction.deferReply({ ephemeral: true });

  const [mission] = await db
    .select()
    .from(missionsTable)
    .where(and(eq(missionsTable.id, missionId), eq(missionsTable.guildId, guildId)));

  if (!mission || mission.status !== "available") {
    return interaction.editReply("❌ This mission is no longer available.");
  }

  // Check if user already has an active claim on this mission
  const existingClaim = await db
    .select()
    .from(missionClaimsTable)
    .where(
      and(
        eq(missionClaimsTable.missionId, missionId),
        eq(missionClaimsTable.userId, userId),
        eq(missionClaimsTable.guildId, guildId),
      ),
    );

  const activeClaim = existingClaim.find(
    (c) => c.status === "claimed" || c.status === "submitted",
  );
  if (activeClaim) {
    return interaction.editReply(
      "❌ You already have an active claim on this mission.",
    );
  }

  // Check rank eligibility
  const ranks = await getGuildRanks(guildId);
  const member = await ensureMember(guildId, userId);
  const currentRank = calculateRank(member.completedMissions, ranks);
  const currentRankOrder = currentRank?.rankOrder ?? 0;

  if (ranks.length > 0) {
    if (currentRankOrder < mission.minRankOrder) {
      const reqRank = ranks.find((r) => r.rankOrder === mission.minRankOrder);
      return interaction.editReply(
        `❌ You need to be at least **${reqRank?.rankName ?? `Order ${mission.minRankOrder}`}** to claim this mission.`,
      );
    }
    if (mission.maxRankOrder != null && currentRankOrder > mission.maxRankOrder) {
      const maxRank = ranks.find((r) => r.rankOrder === mission.maxRankOrder);
      return interaction.editReply(
        `❌ This mission is restricted to members at or below **${maxRank?.rankName ?? `Order ${mission.maxRankOrder}`}**.`,
      );
    }
  }

  // Create the claim
  const [claim] = await db
    .insert(missionClaimsTable)
    .values({
      missionId,
      guildId,
      userId,
      status: "claimed",
    })
    .returning();

  // Update member stats
  await db
    .update(membersTable)
    .set({ totalAccepted: member.totalAccepted + 1 })
    .where(and(eq(membersTable.guildId, guildId), eq(membersTable.userId, userId)));

  // DM the user
  let dmSent = false;
  try {
    const dmChannel = await interaction.user.createDM();
    const dmEmbed = missionDmEmbed(mission);
    const dmRow = missionDmRow(claim.id);
    const dmMsg = await dmChannel.send({ embeds: [dmEmbed], components: [dmRow] });

    await db
      .update(missionClaimsTable)
      .set({ dmChannelId: dmChannel.id, dmMessageId: dmMsg.id })
      .where(eq(missionClaimsTable.id, claim.id));

    dmSent = true;
  } catch {
    // User may have DMs disabled
  }

  // Update board message to show claimed
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
            const minRank = ranks.find((r) => r.rankOrder === mission.minRankOrder);
            const maxRank = mission.maxRankOrder != null
              ? ranks.find((r) => r.rankOrder === mission.maxRankOrder)
              : null;
            const updatedEmbed = missionBoardEmbed(
              mission,
              minRank?.rankName ?? `Order ${mission.minRankOrder}`,
              maxRank?.rankName ?? (mission.maxRankOrder != null ? `Order ${mission.maxRankOrder}` : null),
              userId,
            );
            await msg.edit({
              embeds: [updatedEmbed],
              components: [missionBoardRow(missionId, true)],
            });
          }
        }
      } catch {
        // Board update is best-effort
      }
    }
  }

  return interaction.editReply(
    dmSent
      ? "✅ Mission accepted! Check your DMs for details and instructions."
      : "✅ Mission accepted! ⚠️ I couldn't send you a DM — please enable DMs from server members so I can send you mission details.",
  );
}
