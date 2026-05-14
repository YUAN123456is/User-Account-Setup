import app from "./app";
import { logger } from "./lib/logger";
import { initAdminUser, fixTeamRecordSpend } from "./lib/init-admin";
import { runFbSync, yesterday } from "./routes/meta-tokens";
import { msUntilHourUTC8 } from "./lib/tz";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

initAdminUser().catch((err) => {
  logger.error({ err }, "Failed to initialize admin user");
});

fixTeamRecordSpend().catch((err) => {
  logger.error({ err }, "Failed to fix team record spend");
});

// Daily auto-sync: run at 02:00 UTC-8 every day
function scheduleDailyFbSync() {
  function msUntilNextRun() {
    return msUntilHourUTC8(2);
  }

  function schedule() {
    const delay = msUntilNextRun();
    logger.info({ nextRunIn: `${Math.round(delay / 60000)} min` }, "FB daily sync scheduled");
    setTimeout(async () => {
      const date = yesterday();
      logger.info({ date }, "FB daily auto-sync starting");
      try {
        const results = await runFbSync(date, date);
        const total = results[0];
        logger.info({ date, matched: total?.matched, unmatched: total?.unmatched, errors: total?.errors }, "FB daily auto-sync complete");
      } catch (err) {
        logger.error({ err }, "FB daily auto-sync failed");
      }
      schedule();
    }, delay);
  }

  schedule();
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  scheduleDailyFbSync();
});
