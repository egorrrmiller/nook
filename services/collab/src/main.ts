import { loadConfig, loadDotEnv } from "./config.js";
import { createLogger } from "./logger.js";
import { startCollab } from "./server.js";

const envFile = loadDotEnv();
const config = loadConfig();
const log = createLogger({ level: config.logLevel, pretty: config.logPretty });
if (envFile) log.info({ envFile }, "loaded environment file");

const running = await startCollab(config, log);

let stopping = false;
async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  log.info({ signal }, "received signal");
  const killer = setTimeout(() => {
    log.error("forced exit after shutdown timeout");
    process.exit(1);
  }, config.shutdownTimeoutMs + 5000);
  killer.unref();
  try {
    await running.stop();
    process.exit(0);
  } catch (err) {
    log.error({ err }, "error during shutdown");
    process.exit(1);
  }
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("unhandledRejection", (reason) => log.error({ err: reason }, "unhandled rejection"));
process.on("uncaughtException", (err) => {
  log.fatal({ err }, "uncaught exception");
  process.exit(1);
});
