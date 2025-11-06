const ENABLE_VERBOSE_LOGS = false;
if (typeof window !== "undefined" && !ENABLE_VERBOSE_LOGS) {
    // Silence common console methods to avoid spammy logs during development/testing.
    (console as any).log = () => { };
    (console as any).info = () => { };
    (console as any).debug = () => { };
    (console as any).warn = () => { };
    // keep console.error visible
}

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
    ts: string; // ISO
    level: LogLevel;
    tag?: string;
    message: string;
    meta?: Record<string, any>;
}

export const createLogger = (opts: { endpoint?: string; flushIntervalMs?: number } = {}) => {
    const endpoint = opts.endpoint ?? "https://admin.armydex.pro/api/log-save";
    const flushIntervalMs = opts.flushIntervalMs ?? 2000;

    const buffer: LogEntry[] = [];
    let timer: number | null = null;
    let failingSince: number | null = null;

    const now = () => new Date().toISOString();

    const push = (entry: LogEntry) => {
        buffer.push(entry);

        console.log("[LOGGER] new entry:", entry, "bufferSize:", buffer.length);
        if (!timer) {
            timer = window.setTimeout(flush, flushIntervalMs);
        }
    };

    const log = (level: LogLevel, message: string, tag?: string, meta?: Record<string, any>) => {
        const e: LogEntry = { ts: now(), level, tag, message, meta };
        push(e);

        (level === "error" ? console.error : level === "warn" ? console.warn : console.log)("[LOG]", e);
    };

    const flush = async () => {
        if (buffer.length === 0) {
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
            return;
        }

        const payload = buffer.splice(0, buffer.length);

        try {
            await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ logs: payload }),
            });
            failingSince = null;
        } catch (err) {
            buffer.unshift(...payload);
            if (!failingSince) failingSince = Date.now();
            const age = Date.now() - (failingSince ?? Date.now());
            const backoff = Math.min(30000, 1000 + Math.pow(2, Math.floor(age / 2000)) * 1000);
            if (timer) clearTimeout(timer);
            timer = window.setTimeout(flush, backoff);
        }
    };

    const flushNow = async () => {
        await flush();
    };

    return {
        debug: (m: string, tag?: string, meta?: Record<string, any>) => log("debug", m, tag, meta),
        info: (m: string, tag?: string, meta?: Record<string, any>) => log("info", m, tag, meta),
        warn: (m: string, tag?: string, meta?: Record<string, any>) => log("warn", m, tag, meta),
        error: (m: string, tag?: string, meta?: Record<string, any>) => log("error", m, tag, meta),
        flushNow,
        _buffer: buffer,
    };
};

export const logger = createLogger({
    endpoint: "https://admin.armydex.pro/api/log-save",
    flushIntervalMs: 1500,
});
