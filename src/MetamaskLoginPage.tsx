import React, { useEffect, useState, useRef } from "react";
/**
 * Metamask Login Page (single-file React + TypeScript)
 * - TailwindCSS classes used for styling (you can adapt to MUI if you prefer)
 * - Uses window.ethereum (MetaMask) + ethers where needed
 * - Full logging utility which buffers logs and sends them to /api/logs
 * - Visual log console on the page (so "logs everywhere")
 *
 * How to use:
 * - Create a Vite + React + TypeScript app, install dependencies: ethers
 * - Add Tailwind to the project or replace classes with your preferred CSS
 * - Drop this file as src/App.tsx and run dev server
 */

// If you prefer ethers types, install: npm i ethers
// But this file uses minimal direct window.ethereum calls; uncomment ethers import if you want.
// import { ethers } from "ethers";

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  ts: string; // ISO
  level: LogLevel;
  tag?: string;
  message: string;
  meta?: Record<string, any>;
}

/** Simple logger with buffering + send to server + retry/backoff */
const createLogger = (opts: { endpoint?: string; flushIntervalMs?: number } = {}) => {
  const endpoint = opts.endpoint ?? "/api/logs";
  const flushIntervalMs = opts.flushIntervalMs ?? 2000;

  const buffer: LogEntry[] = [];
  let timer: number | null = null;
  let failingSince: number | null = null;

  const now = () => new Date().toISOString();

  const push = (entry: LogEntry) => {
    buffer.push(entry);
    // console.debug("local log buffer size", buffer.length);
    if (!timer) {
      timer = window.setTimeout(flush, flushIntervalMs);
    }
  };

  const log = (level: LogLevel, message: string, tag?: string, meta?: Record<string, any>) => {
    const e: LogEntry = { ts: now(), level, tag, message, meta };
    push(e);
    // also print locally to console
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
      // push logs back to front and mark failing time
      buffer.unshift(...payload);
      if (!failingSince) failingSince = Date.now();
      // exponential backoff: schedule flush again
      const age = Date.now() - (failingSince ?? Date.now());
      const backoff = Math.min(30000, 1000 + Math.pow(2, Math.floor(age / 2000)) * 1000);
      if (timer) clearTimeout(timer);
      timer = window.setTimeout(flush, backoff);
    }
  };

  // manual flush
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

const logger = createLogger({ endpoint: "/api/logs", flushIntervalMs: 1500 });

// Small helper to read short balance (wei -> ether) if ethers available. Keep minimal to avoid deps.
const formatEth = (weiStr: string | number) => {
  try {
    // if ethers available: ethers.utils.formatEther
    // Fallback: assume wei as string of number; convert to number of ETH
    const big = typeof weiStr === "string" ? BigInt(weiStr) : BigInt(Math.floor(Number(weiStr)));
    const div = BigInt(1_000_000_000_000_000_000);
    const whole = big / div;
    const rem = big % div;
    const remStr = rem.toString().padStart(18, "0").slice(0, 6);
    return `${whole.toString()}.${remStr}`;
  } catch (e) {
    return String(weiStr);
  }
};

export default function MetamaskLoginPage(): JSX.Element {
  const [connected, setConnected] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [verbose, setVerbose] = useState(true);
  const logsRef = useRef<HTMLDivElement | null>(null);

  // Mirror logger buffer into UI
  useEffect(() => {
    const interval = setInterval(() => {
      const b = (logger as any)._buffer as LogEntry[];
      if (b.length > 0) {
        // append local copy into visible logs and clear buffer copy for display (server buffer remains)
        setLogs((prev) => [...prev, ...b.slice(0)]);
      }
    }, 800);
    return () => clearInterval(interval);
  }, []);

  // auto-scroll logs
  useEffect(() => {
    if (logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [logs]);

  // install metamask listeners
  useEffect(() => {
    const eth = (window as any).ethereum;
    if (!eth) {
      logger.warn("No window.ethereum detected", "init");
      return;
    }

    const onAccounts = (accounts: string[]) => {
      logger.info("accountsChanged event", "provider", { accounts });
      if (accounts.length === 0) {
        setConnected(false);
        setAddress(null);
      } else {
        setConnected(true);
        setAddress(accounts[0]);
        fetchBalance(accounts[0]);
      }
    };

    const onChain = (c: string) => {
      logger.info("chainChanged event", "provider", { chainId: c });
      setChainId(c);
    };

    const onDisconnect = (err: any) => {
      logger.warn("disconnect event", "provider", { err });
      setConnected(false);
      setAddress(null);
    };

    eth.on && eth.on("accountsChanged", onAccounts);
    eth.on && eth.on("chainChanged", onChain);
    eth.on && eth.on("disconnect", onDisconnect);

    return () => {
      eth.removeListener && eth.removeListener("accountsChanged", onAccounts);
      eth.removeListener && eth.removeListener("chainChanged", onChain);
      eth.removeListener && eth.removeListener("disconnect", onDisconnect);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchBalance = async (acc: string) => {
    const eth = (window as any).ethereum;
    if (!eth) return;
    try {
      logger.debug("Fetching balance", "balance", { account: acc });
      // RPC call
      const res = await eth.request({ method: "eth_getBalance", params: [acc, "latest"] });
      logger.info("Balance fetched", "balance", { raw: res });
      setBalance(formatEth(res));
    } catch (err) {
      logger.error("Failed to fetch balance", "balance", { err: String(err) });
    }
  };

  const connectMetaMask = async () => {
    const eth = (window as any).ethereum;
    logger.info("Connect button clicked", "ui");
    if (!eth) {
      logger.error("MetaMask / Ethereum provider not found", "connect");
      alert("MetaMask не установлен. Установите расширение и попробуйте снова.");
      return;
    }

    try {
      logger.debug("Requesting accounts", "connect");
      const accounts: string[] = await eth.request({ method: "eth_requestAccounts" });
      logger.info("Accounts granted", "connect", { accounts });
      if (accounts.length > 0) {
        setConnected(true);
        setAddress(accounts[0]);
        const chain = await eth.request({ method: "eth_chainId" });
        setChainId(chain);
        fetchBalance(accounts[0]);

        // send a special success log with environment metadata
        logger.info("User connected via MetaMask", "auth", {
          account: accounts[0],
          chainId: chain,
          userAgent: navigator.userAgent,
          url: window.location.href,
          tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
      }
    } catch (err: any) {
      logger.error("MetaMask connection failed", "connect", { error: String(err) });
      if (err && err.code === 4001) {
        // user rejected
        logger.warn("User rejected connection request", "connect");
      }
    }
  };

  const disconnect = () => {
    logger.info("Manual disconnect clicked", "ui");
    setConnected(false);
    setAddress(null);
    setBalance(null);
    // cannot fully disconnect MetaMask from page without page reload, but we clear local state
    logger.debug("Local state cleared on disconnect", "auth");
  };

  const exportLogs = async () => {
    try {
      await logger.flushNow();
      logger.info("Logs flush requested by user", "ui");
      alert("Логи отправлены на сервер (или в очередь отправки). Проверяйте endpoint /api/logs.");
    } catch (e) {
      logger.error("Failed to flush logs", "ui", { err: String(e) });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-900 via-gray-800 to-black p-6">
      <div className="w-full max-w-2xl bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-8 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-extrabold text-white">Вход в dApp</h1>
            <p className="mt-1 text-sm text-gray-300">Подключитесь через MetaMask для продолжения</p>
          </div>
          <div className="flex gap-2 items-center">
            <div className="text-xs text-gray-300">Verbose</div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" checked={verbose} onChange={() => setVerbose((s) => !s)} className="sr-only" />
              <div className="w-11 h-6 bg-gray-700 rounded-full shadow-inner" />
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="flex flex-col gap-4">
            <div className="p-6 bg-gradient-to-br from-purple-700 via-pink-600 to-red-500 rounded-xl shadow-lg">
              <button
                onClick={connectMetaMask}
                className="w-full flex items-center gap-4 justify-center px-6 py-3 bg-white/90 rounded-lg font-semibold text-gray-800 hover:scale-[1.01] transition-transform"
                aria-label="Connect with MetaMask"
              >
                {/* MetaMask fox simple svg */}
                <span className="w-8 h-8 inline-block">
                  <svg viewBox="0 0 318 318" xmlns="http://www.w3.org/2000/svg">
                    <path d="M274.1 35.1L169.6 97.4 270.7 126.3 274.1 35.1z" fill="#e2761b" />
                    <path d="M43.9 35.1L48.1 126.3 149.3 97.4 43.9 35.1z" fill="#e2761b" />
                    <path d="M87.6 251.1L119.9 279.9 167 255.8 87.6 251.1z" fill="#c0ac9d" />
                    <path d="M230.4 251.1L151.1 255.8 198.1 279.9 230.4 251.1z" fill="#c0ac9d" />
                    <path d="M86.9 161.3L58.3 133.8 41.5 146.6 86.9 161.3z" fill="#763f1a" />
                    <path d="M231.1 161.3L276.5 146.6 259.8 133.8 231.1 161.3z" fill="#763f1a" />
                    <path d="M121.3 111.9L50.7 128.4 87.8 154.6 121.3 111.9z" fill="#f5841f" />
                    <path d="M196.7 111.9L230.2 154.6 267.3 128.4 196.7 111.9z" fill="#f5841f" />
                  </svg>
                </span>
                <span>Подключить MetaMask</span>
              </button>

              <div className="mt-3 text-xs text-white/90">Кнопка красиво оформлена — замените svg на логотип проекта при желании.</div>
            </div>

            <div className="p-4 bg-white/3 rounded-xl border border-white/6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-gray-300">Статус</div>
                  <div className="text-lg text-white font-medium">{connected ? "Подключен" : "Не подключен"}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-300">Chain</div>
                  <div className="text-sm text-white">{chainId ?? "—"}</div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-2">
                <div className="text-xs text-gray-300">Адрес</div>
                <div className="text-sm text-white break-all">{address ?? "—"}</div>
                <div className="text-xs text-gray-300 mt-2">Баланс (ETH)</div>
                <div className="text-sm text-white">{balance ?? "—"}</div>

                <div className="mt-4 flex gap-2">
                  <button className="px-3 py-2 bg-white/10 rounded-md text-sm text-white" onClick={disconnect}>
                    Отключить (локально)
                  </button>
                  <button className="px-3 py-2 bg-white/10 rounded-md text-sm text-white" onClick={exportLogs}>
                    Отправить логи
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col">
            <div className="flex-1 p-4 bg-white/3 rounded-xl border border-white/6 overflow-hidden">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm text-gray-300">Live Logs</div>
                <div className="text-xs text-gray-400">Буфер: {(logger as any)._buffer.length}</div>
              </div>

              <div ref={logsRef} className="h-72 overflow-auto bg-black/60 rounded-md p-3 text-xs text-white font-mono">
                {logs.length === 0 ? (
                  <div className="text-gray-400">Здесь будут отображаться логи (клики, ошибки, события провайдера и т.д.)</div>
                ) : (
                  logs.map((l, i) => (
                    <div key={i} className="mb-1">
                      <span className="text-gray-400">[{l.ts}]</span>{" "}
                      <span className={`px-1 rounded text-[10px] ${l.level === "error" ? "bg-red-700" : l.level === "warn" ? "bg-yellow-700" : "bg-gray-700"}`}>
                        {l.level.toUpperCase()}
                      </span>{" "}
                      <span className="text-white">{l.tag ? `[${l.tag}]` : ""} {l.message}</span>
                      {l.meta ? <pre className="text-[10px] text-gray-300 mt-1">{JSON.stringify(l.meta)}</pre> : null}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="mt-3 p-3 bg-white/3 rounded-xl border border-white/6">
              <div className="text-sm text-gray-300 mb-2">Краткие действия для интеграции на сервере</div>
              <ol className="text-xs text-gray-200 list-decimal list-inside">
                {/* <li>Создайте endpoint POST /api/logs, принимающий JSON {"logs": LogEntry[] }.</li> */}
                <li>Сохраните логи, индексируйте по ts, level и tag.</li>
                <li>Отправляйте ответ 200/201 быстро — клиент ожидает успеха.</li>
              </ol>
            </div>
          </div>
        </div>

        <div className="mt-6 text-xs text-gray-400">Подсказка: замените endpoint логов на реальный URL в createLogger().</div>
      </div>
    </div>
  );
}
