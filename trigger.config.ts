import { defineConfig } from "@trigger.dev/sdk";

// Replace with your project's ref from the Trigger.dev dashboard (Project Settings -> "proj_...").
// Every client deployment of this automation should use its own Trigger.dev project so that
// env vars (HubSpot token, delivery credentials, thresholds) never leak between clients.
export default defineConfig({
  project: "proj_yetxujhdpdjesbzhtcdf",
  runtime: "node",
  logLevel: "log",
  maxDuration: 300,
  dirs: ["./src/trigger"],
});
