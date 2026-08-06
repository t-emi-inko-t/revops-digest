import type { DeliveryConfig, RankedDigest } from "../../types.js";
import type { DeliveryAdapter } from "../types.js";
import { renderDigestHtml, renderDigestSubject } from "./template.js";

export const emailAdapter: DeliveryAdapter = {
  async deliver(digest: RankedDigest, config: DeliveryConfig): Promise<void> {
    if (!config.email) throw new Error("Email delivery selected but email config is missing");
    const { resendApiKey, fromEmail, recipientEmail } = config.email;

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: recipientEmail.split(",").map((e) => e.trim()),
        subject: renderDigestSubject(digest),
        html: renderDigestHtml(digest, config.digestCurrency, config.digestTimezone, config.brand),
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Resend send failed (${response.status}): ${body}`);
    }

    // Resend returns 2xx as soon as the email is QUEUED, not once it's actually delivered —
    // it can still fail downstream (e.g. rejected for size) with no error surfaced here. Log
    // the id so a failure can be looked up via GET /emails/{id} without guessing which run it
    // came from.
    const { id } = (await response.json()) as { id: string };
    console.log(`Digest email queued via Resend (id: ${id}) — check resend.com/emails for final delivery status.`);
  },
};
