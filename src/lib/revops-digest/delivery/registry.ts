import type { DeliveryMethod } from "../types.js";
import { clickupAdapter } from "./clickup/adapter.js";
import { emailAdapter } from "./email/adapter.js";
import { slackAdapter } from "./slack/adapter.js";
import type { DeliveryAdapter } from "./types.js";

export function getDeliveryAdapter(method: DeliveryMethod): DeliveryAdapter {
  switch (method) {
    case "email":
      return emailAdapter;
    case "slack":
      return slackAdapter;
    case "clickup":
      return clickupAdapter;
  }
}
