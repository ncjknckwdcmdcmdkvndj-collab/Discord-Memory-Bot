import type { Interaction } from "discord.js";
import { handleAcceptMission } from "./acceptMission";
import { handleUnacceptMission } from "./unacceptMission";
import { handleSubmitMission } from "./submitMission";
import {
  handleApproveSubmission,
  handleDenySubmission,
  handleDenyModal,
} from "./reviewMission";

export async function handleInteraction(interaction: Interaction) {
  // ── Button interactions ──────────────────────────────────────────────────
  if (interaction.isButton()) {
    const [action, ...rest] = interaction.customId.split(":");
    const param = rest.join(":");

    try {
      if (action === "accept_mission") {
        await handleAcceptMission(interaction, parseInt(param, 10));
      } else if (action === "unaccept_mission") {
        await handleUnacceptMission(interaction, parseInt(param, 10));
      } else if (action === "submit_mission") {
        await handleSubmitMission(interaction, parseInt(param, 10));
      } else if (action === "approve_submission") {
        await handleApproveSubmission(interaction, parseInt(param, 10));
      } else if (action === "deny_submission") {
        await handleDenySubmission(interaction, parseInt(param, 10));
      }
    } catch (err) {
      console.error("Button interaction error:", err);
      try {
        const errMsg = { content: "⚠️ An error occurred. Please try again.", ephemeral: true };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(errMsg);
        } else {
          await interaction.reply(errMsg);
        }
      } catch {
        // Ignore
      }
    }
    return;
  }

  // ── Modal submissions ────────────────────────────────────────────────────
  if (interaction.isModalSubmit()) {
    const [action, ...rest] = interaction.customId.split(":");
    const param = rest.join(":");

    try {
      if (action === "deny_modal") {
        await handleDenyModal(interaction, parseInt(param, 10));
      }
    } catch (err) {
      console.error("Modal interaction error:", err);
      try {
        const errMsg = { content: "⚠️ An error occurred. Please try again.", ephemeral: true };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(errMsg);
        } else {
          await interaction.reply(errMsg);
        }
      } catch {
        // Ignore
      }
    }
    return;
  }
}
