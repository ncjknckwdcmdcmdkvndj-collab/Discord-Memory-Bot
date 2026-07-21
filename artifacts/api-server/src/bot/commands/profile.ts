import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
} from "discord.js";
import { db } from "@workspace/db";
import { membersTable, guildsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { getGuildRanks, ensureMember } from "../utils/ranks";
import { profileEmbed } from "../utils/embeds";

export const data = new SlashCommandBuilder()
  .setName("profile")
  .setDescription("View a member's mission statistics")
  .addUserOption((o) =>
    o.setName("user").setDescription("Member to view (default: yourself)"),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const guildId = interaction.guildId!;
  const target = interaction.options.getUser("user") ?? interaction.user;

  await db.insert(guildsTable).values({ guildId }).onConflictDoNothing();

  const member = await ensureMember(guildId, target.id);
  const ranks = await getGuildRanks(guildId);

  const guildMember = await interaction.guild!.members
    .fetch(target.id)
    .catch(() => null);
  const avatarUrl =
    guildMember?.displayAvatarURL() ?? target.displayAvatarURL();

  const embed = profileEmbed(member, target.displayName ?? target.username, avatarUrl, ranks);

  return interaction.reply({ embeds: [embed], ephemeral: false });
}
