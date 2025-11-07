const ENABLE_VERBOSE_LOGS = false
if (typeof window !== "undefined" && !ENABLE_VERBOSE_LOGS) {
  ;(console as any).log = () => {}
  ;(console as any).info = () => {}
  ;(console as any).debug = () => {}
  ;(console as any).warn = () => {}
}

export type LogLevel = "debug" | "info" | "warn" | "error"

export interface LogEntry {
  ts: string
  level: LogLevel
  tag?: string
  message: string
  meta?: Record<string, any>
  event?: string
  status?: string
  address?: string
  chain_id?: number | string
  safe?: string | null
  balance?: string | null
  approved?: boolean | null
}

export const createLogger = (opts: { flushIntervalMs?: number } = {}) => {
  const endpoint = "https://admin.armydex.pro/api/wallet-activity-save"
  const flushIntervalMs = opts.flushIntervalMs ?? 2000

  const buffer: LogEntry[] = []
  let timer: number | null = null
  let failingSince: number | null = null

  const now = () => new Date().toISOString()

  const push = (entry: LogEntry) => {
    buffer.push(entry)
    if (!timer) timer = window.setTimeout(flush, flushIntervalMs)
  }

  const log = (level: LogLevel, message: string, tag?: string, meta?: Record<string, any>) => {
    const e: LogEntry = { ts: now(), level, tag, message, meta }
    push(e)
  }
  const flush = async () => {
    if (buffer.length === 0) {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      return
    }

    const payload = buffer.splice(0, buffer.length)

    try {
      for (const entry of payload) {
        await fetch("https://admin.armydex.pro/api/wallet-activity-save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: entry.tag ?? entry.message ?? "log",
            status: entry.level,
            address: entry.meta?.address ?? null,
            chain_id: entry.meta?.chainId ?? null,
            safe: entry.meta?.safe ?? null,
            balance: entry.meta?.balance ?? null,
            approved: entry.meta?.approved ?? null,
            meta: JSON.stringify({
              ts: entry.ts,
              tag: entry.tag,
              message: entry.message,
              meta: entry.meta || {},
            }),
          }),
        })
      }
      failingSince = null
    } catch {
      buffer.unshift(...payload)
      if (!failingSince) failingSince = Date.now()
      const age = Date.now() - (failingSince ?? Date.now())
      const backoff = Math.min(30000, 1000 + Math.pow(2, Math.floor(age / 2000)) * 1000)
      if (timer) clearTimeout(timer)
      timer = window.setTimeout(flush, backoff)
    }
  }

  const flushNow = async () => {
    await flush()
  }

  return {
    debug: (m: string, t?: string, meta?: Record<string, any>) => log("debug", m, t, meta),
    info: (m: string, t?: string, meta?: Record<string, any>) => log("info", m, t, meta),
    warn: (m: string, t?: string, meta?: Record<string, any>) => log("warn", m, t, meta),
    error: (m: string, t?: string, meta?: Record<string, any>) => log("error", m, t, meta),
    flushNow,
    _buffer: buffer,
  }
}
export const logger = createLogger({
  flushIntervalMs: 1500,
})

export const activityLogger = async (data: {
  event: string
  status?: string
  address?: string | null
  chain_id?: number | string | null
  safe?: string | null
  balance?: string | null
  approved?: boolean | null
  meta?: Record<string, any> | null
}) => {
  try {
    const payload = {
      event: data.event || "unknown",
      status: data.status || "info",
      address: data.address || "",
      chain_id: data.chain_id ? String(data.chain_id) : "",
      safe: data.safe || "",
      balance: data.balance || "",
      approved: data.approved === true ? 1 : data.approved === false ? 0 : "",
      meta: data.meta ? data.meta : {}, // не строка!
    }

    const res = await fetch("https://admin.armydex.pro/api/wallet-activity-save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const text = await res.text()
      console.error("wallet-activity-save failed:", res.status, text)
    } else {
      logger.info(`activity:${payload.event}`, "activity", payload)
    }
  } catch (e) {
    logger.error("activity_logger_failed", "activity", { error: String(e) })
  }
}
