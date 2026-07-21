import { Router } from "express";
import type { Client } from "discord.js";

export function createInviteRouter(client: Client) {
  const router = Router();

  router.get("/invite", (_req, res) => {
    const inviteUrl = (client as Client & { inviteUrl?: string }).inviteUrl;
    if (!inviteUrl) {
      res.status(503).json({ error: "Bot not ready yet, try again in a moment." });
      return;
    }
    // Redirect directly to Discord's OAuth page
    res.redirect(inviteUrl);
  });

  return router;
}
