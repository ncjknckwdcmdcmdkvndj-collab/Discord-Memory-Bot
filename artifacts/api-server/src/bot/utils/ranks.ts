import { db } from "@workspace/db";
import { rankConfigsTable, membersTable, type RankConfig } from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import type { Guild, GuildMember } from "discord.js";

/**
 * Get sorted rank configs for a guild (ascending by missionsRequired).
 */
export async function getGuildRanks(guildId: string): Promise<RankConfig[]> {
  return db
    .select()
    .from(rankConfigsTable)
    .where(eq(rankConfigsTable.guildId, guildId))
    .orderBy(asc(rankConfigsTable.missionsRequired));
}

/**
 * Determine the current rank for a member based on completed missions.
 */
export function calculateRank(
  completedMissions: number,
  ranks: RankConfig[],
): RankConfig | null {
  const sorted = [...ranks].sort((a, b) => b.missionsRequired - a.missionsRequired);
  return sorted.find((r) => completedMissions >= r.missionsRequired) ?? null;
}

/**
 * Get the next rank a member is working toward.
 */
export function nextRank(
  completedMissions: number,
  ranks: RankConfig[],
): RankConfig | null {
  const sorted = [...ranks].sort((a, b) => a.missionsRequired - b.missionsRequired);
  return sorted.find((r) => completedMissions < r.missionsRequired) ?? null;
}

/**
 * Update member rank roles in Discord after a mission is completed.
 * Assigns the highest earned rank role and removes lower ones.
 */
export async function syncMemberRoles(
  member: GuildMember,
  guildId: string,
  completedMissions: number,
): Promise<void> {
  const ranks = await getGuildRanks(guildId);
  if (ranks.length === 0) return;

  const currentRank = calculateRank(completedMissions, ranks);

  for (const rank of ranks) {
    if (!rank.roleId) continue;
    const role = member.guild.roles.cache.get(rank.roleId);
    if (!role) continue;

    const shouldHave = currentRank && rank.rankOrder <= currentRank.rankOrder;

    try {
      if (shouldHave && !member.roles.cache.has(rank.roleId)) {
        await member.roles.add(role);
      } else if (!shouldHave && member.roles.cache.has(rank.roleId)) {
        await member.roles.remove(role);
      }
    } catch {
      // Role management may fail if bot lacks permissions — silent skip
    }
  }
}

/**
 * Ensure a member row exists, returning the current record.
 */
export async function ensureMember(guildId: string, userId: string) {
  const [existing] = await db
    .select()
    .from(membersTable)
    .where(and(eq(membersTable.guildId, guildId), eq(membersTable.userId, userId)));

  if (existing) return existing;

  const [created] = await db
    .insert(membersTable)
    .values({ guildId, userId })
    .returning();
  return created;
}

/**
 * Update streak after a mission completion.
 */
export function computeStreak(
  lastCompletedDate: string | null,
  currentStreak: number,
  longestStreak: number,
): { newStreak: number; newLongest: number; todayStr: string } {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  if (!lastCompletedDate) {
    return { newStreak: 1, newLongest: Math.max(longestStreak, 1), todayStr };
  }

  if (lastCompletedDate === todayStr) {
    // Already completed one today — streak unchanged
    return { newStreak: currentStreak, newLongest: longestStreak, todayStr };
  }

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  if (lastCompletedDate === yesterdayStr) {
    const newStreak = currentStreak + 1;
    return { newStreak, newLongest: Math.max(longestStreak, newStreak), todayStr };
  }

  // Streak broken
  return { newStreak: 1, newLongest: Math.max(longestStreak, 1), todayStr };
}
