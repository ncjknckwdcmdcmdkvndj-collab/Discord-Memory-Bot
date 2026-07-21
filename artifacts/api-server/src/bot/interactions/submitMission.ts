import { ButtonInteraction, TextChannel } from "discord.js";
import { db } from "@workspace/db";
import {
  missionClaimsTable,
  missionsTable,
  guildsTable,
  type ProofMessage,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { reviewEmbed, reviewRow } from "../utils/embeds";

export async function handleSubmitMission(
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
      content:
        claim.status === "submitted"
          ? "⚠️ You've already submitted this mission. Staff will review it shortly."
          : "❌ This mission is no longer in an active state.",
      ephemeral: true,
    });
  }

  // Collect proof from DM channel history
  let proof: ProofMessage[] = [];
  if (claim.dmChannelId && claim.dmMessageId) {
    try {
      const dmChannel = await interaction.client.channels
        .fetch(claim.dmChannelId)
        .catch(() => null);
      if (dmChannel && dmChannel.isTextBased()) {
        const messages = await (dmChannel as TextChannel).messages.fetch({
          limit: 50,
          after: claim.dmMessageId,
        });

        proof = messages
          .filter(
            (m) =>
              !m.author.bot &&
              m.author.id === interaction.user.id,
          )
          .map((m) => ({
            content: m.content,
            attachments: m.attachments.map((a) => a.url),
            timestamp: m.createdAt.toISOString(),
            authorId: m.author.id,
          }))
          .reverse(); // Chronological order
      }
    } catch {
      // DM fetch failed — continue with empty proof
    }
  }

  const now = new Date();

  await db
    .update(missionClaimsTable)
    .set({
      status: "submitted",
      submittedAt: now,
      proof,
    })
    .where(eq(missionClaimsTable.id, claimId));

  const [mission] = await db
    .select()
    .from(missionsTable)
    .where(eq(missionsTable.id, claim.missionId));

  if (!mission) {
    return interaction.followUp({
      content: "❌ Mission not found.",
      ephemeral: true,
    });
  }

  // Post to review channel
  const [guild] = await db
    .select()
    .from(guildsTable)
    .where(eq(guildsTable.guildId, claim.guildId));

  if (guild?.reviewChannelId) {
    try {
      const guildObj = interaction.client.guilds.cache.get(claim.guildId);
      if (guildObj) {
        const reviewCh = guildObj.channels.cache.get(
          guild.reviewChannelId,
        ) as TextChannel | undefined;

        if (reviewCh) {
          const username =
            interaction.user.displayName ?? interaction.user.username;

          // Fetch updated claim with proof
          const [updatedClaim] = await db
            .select()
            .from(missionClaimsTable)
            .where(eq(missionClaimsTable.id, claimId));

          const embed = reviewEmbed(mission, updatedClaim, username);
          const row = reviewRow(claimId);
          const reviewMsg = await reviewCh.send({ embeds: [embed], components: [row] });

          await db
            .update(missionClaimsTable)
            .set({ reviewMessageId: reviewMsg.id })
            .where(eq(missionClaimsTable.id, claimId));
        }
      }
    } catch {
      // Review channel post is best-effort
    }
  }

  // Update DM to disable buttons and confirm
  try {
    await interaction.message.edit({ components: [] });
    await interaction.followUp({
      content:
        "📨 Mission submitted for review! Staff will review your submission shortly. You'll be notified of the outcome.",
      ephemeral: true,
    });
  } catch {
    // Already handled
  }
  return;
}
