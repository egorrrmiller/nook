import { pino, type Logger } from "pino";

export type { Logger };

export function createLogger(opts: { level: string; pretty: boolean }): Logger {
  if (opts.pretty) {
    return pino({
      level: opts.level,
      transport: { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss.l" } },
    });
  }
  return pino({ level: opts.level, base: { service: "collab" } });
}
