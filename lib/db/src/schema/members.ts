import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  jsonb,
  unique,
} from "drizzle-orm/pg-core";
import { guildsTable } from "./guilds";

export const membersTable = pgTable(
  "members",
  {
    id: serial("id").primaryKey(),
    guildId: text("guild_id")
      .notNull()
      .references(() => guildsTable.guildId, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    completedMissions: integer("completed_missions").notNull().default(0),
    totalAccepted: integer("total_accepted").notNull().default(0),
    totalDenied: integer("total_denied").notNull().default(0),
    missionsAbandoned: integer("missions_abandoned").notNull().default(0),
    // rankStats: { [rankOrder: string]: number } — completions per rank tier
    rankStats: jsonb("rank_stats").$type<Record<string, number>>().default({}),
    currentStreak: integer("current_streak").notNull().default(0),
    longestStreak: integer("longest_streak").notNull().default(0),
    lastCompletedDate: text("last_completed_date"), // 'YYYY-MM-DD'
    firstCompletedAt: timestamp("first_completed_at"),
    lastCompletedAt: timestamp("last_completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [unique("members_guild_user_unique").on(t.guildId, t.userId)],
);

export type Member = typeof membersTable.$inferSelect;
export type InsertMember = typeof membersTable.$inferInsert;
