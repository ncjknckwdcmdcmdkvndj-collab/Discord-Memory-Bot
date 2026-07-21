import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { guildsTable } from "./guilds";

export const missionsTable = pgTable("missions", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id")
    .notNull()
    .references(() => guildsTable.guildId, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").notNull(),
  finerDetails: text("finer_details").notNull(),
  minRankOrder: integer("min_rank_order").notNull().default(0),
  maxRankOrder: integer("max_rank_order"), // null = no upper limit
  status: text("status").notNull().default("available"), // 'available' | 'deleted'
  boardMessageId: text("board_message_id"),
  createdByUserId: text("created_by_user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Mission = typeof missionsTable.$inferSelect;
export type InsertMission = typeof missionsTable.$inferInsert;
