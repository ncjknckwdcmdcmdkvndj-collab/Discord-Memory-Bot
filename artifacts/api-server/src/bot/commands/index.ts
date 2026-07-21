import type { ChatInputCommandInteraction, SlashCommandBuilder, SlashCommandOptionsOnlyBuilder, SlashCommandSubcommandsOnlyBuilder } from "discord.js";
import * as setup from "./setup";
import * as rank from "./rank";
import * as mission from "./mission";
import * as profile from "./profile";
import * as leaderboard from "./leaderboard";
import * as points from "./points";

export interface Command {
  data:
    | SlashCommandBuilder
    | SlashCommandOptionsOnlyBuilder
    | SlashCommandSubcommandsOnlyBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<unknown>;
}

export const commands: Command[] = [setup, rank, mission, profile, leaderboard, points];

export const commandMap = new Map<string, Command>(
  commands.map((c) => [c.data.name, c]),
);
