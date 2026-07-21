import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const guildsTable = pgTable("guilds", {
  guildId: text("guild_id").primaryKey(),
  missionBoardChannelId: text("mission_board_channel_id"),
  reviewChannelId: text("review_channel_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Guild = typeof guildsTable.$inferSelect;
export type InsertGuild = typeof guildsTable.$inferInsert;
