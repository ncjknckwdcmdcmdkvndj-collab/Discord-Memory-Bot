import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { guildsTable } from "./guilds";
import { missionsTable } from "./missions";

export interface ProofMessage {
  content: string;
  attachments: string[];
  timestamp: string;
  authorId: string;
}

export const missionClaimsTable = pgTable("mission_claims", {
  id: serial("id").primaryKey(),
  missionId: integer("mission_id")
    .notNull()
    .references(() => missionsTable.id, { onDelete: "cascade" }),
  guildId: text("guild_id")
    .notNull()
    .references(() => guildsTable.guildId, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  status: text("status").notNull().default("claimed"),
  // 'claimed' | 'submitted' | 'completed' | 'denied' | 'abandoned'
  claimedAt: timestamp("claimed_at").defaultNow().notNull(),
  submittedAt: timestamp("submitted_at"),
  completedAt: timestamp("completed_at"),
  proof: jsonb("proof").$type<ProofMessage[]>(),
  dmChannelId: text("dm_channel_id"),
  dmMessageId: text("dm_message_id"), // ID of bot's initial DM
  reviewMessageId: text("review_message_id"), // ID in review channel
  denialReason: text("denial_reason"),
});

export type MissionClaim = typeof missionClaimsTable.$inferSelect;
export type InsertMissionClaim = typeof missionClaimsTable.$inferInsert;
