import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Colors,
} from "discord.js";
import type { Mission, MissionClaim, Member, RankConfig } from "@workspace/db";
import { calculateRank, nextRank } from "./ranks";

// ─── Mission Board Embed ────────────────────────────────────────────────────

export function missionBoardEmbed(
  mission: Mission,
  rankName: string,
  maxRankName: string | null,
  claimedBy: string | null,
) {
  const embed = new EmbedBuilder()
    .setTitle(`📋 ${mission.title}`)
    .setDescription(mission.description)
    .setColor(claimedBy ? Colors.Orange : Colors.Blue)
    .addFields(
      {
        name: "Rank Required",
        value: rankName,
        inline: true,
      },
      {
        name: "Max Rank",
        value: maxRankName ?? "None",
        inline: true,
      },
      {
        name: "Status",
        value: claimedBy ? `🔒 Claimed by <@${claimedBy}>` : "✅ Available",
        inline: true,
      },
    )
    .setFooter({ text: `Mission ID: ${mission.id}` })
    .setTimestamp();

  return embed;
}

export function missionBoardRow(missionId: number, disabled = false) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`accept_mission:${missionId}`)
      .setLabel("Accept Mission")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("⚔️")
      .setDisabled(disabled),
  );
}

// ─── DM Embed (sent to claimant) ───────────────────────────────────────────

export function missionDmEmbed(mission: Mission) {
  return new EmbedBuilder()
    .setTitle(`⚔️ Mission Accepted: ${mission.title}`)
    .setDescription(mission.description)
    .setColor(Colors.Green)
    .addFields({
      name: "📜 Mission Details",
      value: mission.finerDetails,
    })
    .addFields({
      name: "📨 How to Submit",
      value:
        "Reply to this message with your proof (screenshots, videos, etc.), then press **Submit Mission** when ready.",
    })
    .setTimestamp();
}

export function missionDmRow(claimId: number) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`submit_mission:${claimId}`)
      .setLabel("Submit Mission")
      .setStyle(ButtonStyle.Success)
      .setEmoji("📨"),
    new ButtonBuilder()
      .setCustomId(`unaccept_mission:${claimId}`)
      .setLabel("Abandon Mission")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("🏳️"),
  );
}

// ─── Review Channel Embed ───────────────────────────────────────────────────

export function reviewEmbed(
  mission: Mission,
  claim: MissionClaim,
  username: string,
) {
  const proofText =
    claim.proof && claim.proof.length > 0
      ? claim.proof
          .map((p) => {
            const lines: string[] = [];
            if (p.content) lines.push(p.content);
            if (p.attachments.length > 0)
              lines.push(p.attachments.join("\n"));
            return lines.join("\n");
          })
          .join("\n---\n")
          .slice(0, 1020)
      : "No proof submitted.";

  const duration = claim.submittedAt && claim.claimedAt
    ? Math.round(
        (new Date(claim.submittedAt).getTime() -
          new Date(claim.claimedAt).getTime()) /
          60000,
      )
    : 0;

  return new EmbedBuilder()
    .setTitle(`📥 Mission Submission: ${mission.title}`)
    .setColor(Colors.Yellow)
    .addFields(
      { name: "👤 Member", value: `<@${claim.userId}> (${username})`, inline: true },
      { name: "⏱️ Time Taken", value: `${duration} min`, inline: true },
      { name: "📋 Mission ID", value: `#${mission.id}`, inline: true },
      { name: "📄 Description", value: mission.description },
      { name: "📎 Proof / Evidence", value: proofText },
    )
    .setTimestamp();
}

export function reviewRow(claimId: number) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`approve_submission:${claimId}`)
      .setLabel("Accept")
      .setStyle(ButtonStyle.Success)
      .setEmoji("✅"),
    new ButtonBuilder()
      .setCustomId(`deny_submission:${claimId}`)
      .setLabel("Deny")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("❌"),
  );
}

// ─── Profile Embed ──────────────────────────────────────────────────────────

export function profileEmbed(
  member: Member,
  username: string,
  avatarUrl: string | null,
  ranks: RankConfig[],
) {
  const total = member.totalAccepted || 0;
  const completed = member.completedMissions;
  const rate = total > 0 ? ((completed / total) * 100).toFixed(1) : "0.0";

  const currentRank = calculateRank(completed, ranks);
  const next = nextRank(completed, ranks);
  const rankDisplay = currentRank?.rankName ?? "Unranked";
  const nextDisplay = next
    ? `${next.rankName} (${next.missionsRequired - completed} more)`
    : "Max Rank Achieved 🏆";

  // Build rank breakdown
  const rankStats = member.rankStats ?? {};
  const rankBreakdown = ranks
    .map((r) => `${r.rankName}: **${rankStats[String(r.rankOrder)] ?? 0}**`)
    .join("\n");

  const embed = new EmbedBuilder()
    .setTitle(`📊 ${username}'s Profile`)
    .setColor(Colors.Blurple)
    .addFields(
      { name: "🏅 Current Rank", value: rankDisplay, inline: true },
      { name: "⬆️ Next Rank", value: nextDisplay, inline: true },
      { name: "\u200b", value: "\u200b", inline: true },
      { name: "✅ Completed", value: String(completed), inline: true },
      { name: "📨 Accepted", value: String(total), inline: true },
      { name: "❌ Denied", value: String(member.totalDenied), inline: true },
      { name: "🏳️ Abandoned", value: String(member.missionsAbandoned), inline: true },
      {
        name: "📈 Completion Rate",
        value: `${rate}%`,
        inline: true,
      },
      { name: "🔥 Streak", value: `${member.currentStreak} day(s)`, inline: true },
    )
    .setTimestamp();

  if (ranks.length > 0 && rankBreakdown) {
    embed.addFields({ name: "📋 Completions by Tier", value: rankBreakdown });
  }

  if (member.firstCompletedAt) {
    embed.addFields({
      name: "📅 First Completion",
      value: `<t:${Math.floor(new Date(member.firstCompletedAt).getTime() / 1000)}:D>`,
      inline: true,
    });
  }
  if (member.lastCompletedAt) {
    embed.addFields({
      name: "📅 Last Completion",
      value: `<t:${Math.floor(new Date(member.lastCompletedAt).getTime() / 1000)}:R>`,
      inline: true,
    });
  }

  if (avatarUrl) embed.setThumbnail(avatarUrl);

  return embed;
}
