import { ButtonInteraction, TextChannel } from "discord.js";
import { db } from "@workspace/db";
import {
  missionClaimsTable,
  missionsTable,
  membersTable,
  guildsTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { missionBoardEmbed, missionBoardRow } from "../utils/embeds";
import { getGuildRanks } from "../utils/ranks";

export async function handleUnacceptMission(
  interaction: ButtonInteraction,
  claimId: number,
) {
  await interaction.deferUpdate();

  const [claim] = await db
    .select()
    .from(missionClaimsTable)
    .where(eq(missionClaimsTable.id, claimId));

  if (!claim || claim.userId !== interaction.user.id) {
    return interaction.followUp({
      content: "❌ This claim doesn't belong to you.",
      ephemeral: true,
    });
  }

  if (claim.status !== "claimed") {
    return interaction.followUp({
      content: "❌ You can only abandon a mission before submitting it.",
      ephemeral: true,
    });
  }

  // Mark claim as abandoned
  await db
    .update(missionClaimsTable)
    .set({ status: "abandoned" })
    .where(eq(missionClaimsTable.id, claimId));

  // Apply -1 penalty to completed missions (min 0) and track abandonment
  const [memberRow] = await db
    .select()
    .from(membersTable)
    .where(
      and(
        eq(membersTable.guildId, claim.guildId),
        eq(membersTable.userId, claim.userId),
      ),
    );

  if (memberRow) {
    await db
      .update(membersTable)
      .set({
        completedMissions: Math.max(0, memberRow.completedMissions - 1),
        missionsAbandoned: memberRow.missionsAbandoned + 1,
      })
      .where(
        and(
          eq(membersTable.guildId, claim.guildId),
          eq(membersTable.userId, claim.userId),
        ),
      );
  }

  // Disable DM buttons
  try {
    await interaction.message.edit({
      components: [],
      embeds: interaction.message.embeds,
    });
    await interaction.followUp({
      content:
        "🏳️ Mission abandoned. A penalty of **-1 completed mission point** has been applied.",
      ephemeral: true,
    });
  } catch {
    // Already acknowledged
  }

  // Restore mission board post to Available (best-effort)
  const [mission] = await db
    .select()
    .from(missionsTable)
    .where(eq(missionsTable.id, claim.missionId));

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
            const msg = await ch.messages
              .fetch(mission.boardMessageId)
              .catch(() => null);
            if (msg) {
              const ranks = await getGuildRanks(claim.guildId);
              const minRank = ranks.find((r) => r.rankOrder === mission.minRankOrder);
              const maxRank =
                mission.maxRankOrder != null
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
  return;
}
