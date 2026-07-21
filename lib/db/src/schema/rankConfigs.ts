import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { guildsTable } from "./guilds";

export const rankConfigsTable = pgTable("rank_configs", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id")
    .notNull()
    .references(() => guildsTable.guildId, { onDelete: "cascade" }),
  rankName: text("rank_name").notNull(),
  rankOrder: integer("rank_order").notNull(), // higher = higher rank
  missionsRequired: integer("missions_required").notNull(),
  roleId: text("role_id"), // Discord role ID to assign
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type RankConfig = typeof rankConfigsTable.$inferSelect;
export type InsertRankConfig = typeof rankConfigsTable.$inferInsert;
