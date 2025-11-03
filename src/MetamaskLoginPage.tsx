import React, { useEffect, useState, useRef } from "react";

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
  }, []);

  const fetchBalance = async (acc: string) => {
    const eth = (window as any).ethereum;
    if (!eth) return;
    try {
      logger.debug("Fetching balance", "balance", { account: acc });
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
    
        logger.warn("User rejected connection request", "connect");
      }
    }
  };

  const disconnect = () => {
    logger.info("Manual disconnect clicked", "ui");
    setConnected(false);
    setAddress(null);
    setBalance(null);
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
            <h1 className="text-3xl font-extrabold text-white">Вход</h1>
            <p className="mt-1 text-sm text-gray-300">Подключитесь через MetaMask для продолжения</p>
          </div>
          {/* <div className="flex gap-2 items-center">
            <div className="text-xs text-gray-300">Verbose</div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" checked={verbose} onChange={() => setVerbose((s) => !s)} className="sr-only" />
              <div className="w-11 h-6 bg-gray-700 rounded-full shadow-inner" />
            </label>
          </div> */}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="flex flex-col gap-4">
            <div className="p-6 bg-gradient-to-br from-purple-700 via-pink-600 to-red-500 rounded-xl shadow-lg">
              <button
                onClick={connectMetaMask}
                className="w-full flex items-center gap-4 justify-center px-6 py-3 bg-white/90 rounded-lg font-semibold text-gray-800 hover:scale-[1.01] transition-transform"
                aria-label="Connect with MetaMask"
              >
          
                <span className="w-8 h-8 inline-block">
               <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" id="Metamask-Icon--Streamline-Svg-Logos" height="32" width="32">
  
  <path fill="#e17726" d="M23.205225 0.9874275 13.121575 8.448625l1.87515 -4.397125 8.2085 -3.0640725Z" stroke-width="0.25"></path>
  <path fill="#e27625" d="M0.818115 0.996155 9.00465 4.052l1.780525 4.454775L0.818115 0.996155Z" stroke-width="0.25"></path>
  <path fill="#e27625" d="m19.147225 16.855225 4.4568 0.084825 -1.5576 5.291375 -5.438275 -1.49735 2.539075 -3.87885Z" stroke-width="0.25"></path>
  <path fill="#e27625" d="m4.852525 16.855225 2.529675 3.878875 -5.429175 1.497425 -1.5481175 -5.291475 4.4476175 -0.084825Z" stroke-width="0.25"></path>
  <path fill="#e27625" d="m10.543275 7.372 0.1822 5.882675 -5.450075 -0.247975 1.550225 -2.33875 0.019625 -0.02255L10.543275 7.372Z" stroke-width="0.25"></path>
  <path fill="#e27625" d="m13.4003 7.30645 3.75445 3.33925 0.019425 0.022375 1.550275 2.33875 -5.448825 0.247925 0.124675 -5.9483Z" stroke-width="0.25"></path>
  <path fill="#e27625" d="m7.541775 16.87225 2.9759 2.318675 -3.456875 1.669025 0.480975 -3.9877Z" stroke-width="0.25"></path>
  <path fill="#e27625" d="m16.458725 16.871875 0.471 3.988075 -3.447175 -1.669175 2.976175 -2.3189Z" stroke-width="0.25"></path>
  <path fill="#d5bfb2" d="m13.558475 18.9724 3.4981 1.69385 -3.253925 1.546475 0.033775 -1.022125 -0.27795 -2.2182Z" stroke-width="0.25"></path>
  <path fill="#d5bfb2" d="m10.44055 18.97315 -0.26705 2.2007 0.0219 1.037625 -3.26155 -1.54525 3.5067 -1.693075Z" stroke-width="0.25"></path>
  <path fill="#233447" d="m9.430425 14.02245 0.914125 1.921125 -3.11225 -0.911675 2.198125 -1.00945Z" stroke-width="0.25"></path>
  <path fill="#233447" d="m14.56965 14.02265 2.20845 1.009175 -3.12235 0.91145 0.9139 -1.920625Z" stroke-width="0.25"></path>
  <path fill="#cc6228" d="m7.779875 16.852725 -0.5031 4.1345 -2.696325 -4.044125 3.199425 -0.090375Z" stroke-width="0.25"></path>
  <path fill="#cc6228" d="m16.22045 16.852775 3.199525 0.0904L16.7135 20.9874l-0.49305 -4.134625Z" stroke-width="0.25"></path>
  <path fill="#cc6228" d="m18.803175 12.773 -2.328475 2.37305 -1.795225 -0.820375 -0.85955 1.8069 -0.56345 -3.1072 5.5467 -0.252375Z" stroke-width="0.25"></path>
  <path fill="#cc6228" d="m5.19555 12.77295 5.547675 0.2524 -0.563475 3.107225 -0.8597 -1.8067 -1.785775 0.8202 -2.338725 -2.373125Z" stroke-width="0.25"></path>
  <path fill="#e27525" d="m5.038825 12.286075 2.6344 2.6732 0.0913 2.63905 -2.7257 -5.31225Z" stroke-width="0.25"></path>
  <path fill="#e27525" d="M18.963975 12.28125 16.2334 17.603l0.1028 -2.643775L18.963975 12.28125Z" stroke-width="0.25"></path>
  <path fill="#e27525" d="m10.6146 12.448725 0.106025 0.667375 0.262 1.6625 -0.168425 5.10625 -0.79635 -4.1019 -0.000275 -0.0424 0.597025 -3.291825Z" stroke-width="0.25"></path>
  <path fill="#e27525" d="m13.384 12.439575 0.5986 3.301025 -0.00025 0.0424 -0.79835 4.11215 -0.0316 -1.028525 -0.124575 -4.1182 0.356175 -2.30885Z" stroke-width="0.25"></path>
  <path fill="#f5841f" d="m16.5705 14.8529 -0.08915 2.2929 -2.77905 2.16525 -0.5618 -0.39695 0.62975 -3.243675 2.80025 -0.817525Z" stroke-width="0.25"></path>
  <path fill="#f5841f" d="m7.439075 14.852975 2.790625 0.817525 0.629725 3.243625 -0.561825 0.396925 -2.7792 -2.165425 -0.079325 -2.29265Z" stroke-width="0.25"></path>
  <path fill="#c0ac9d" d="m6.4021 20.15985 3.555475 1.68465 -0.01505 -0.719375L10.24 20.864h3.51895l0.30825 0.26025 -0.0227 0.718875 3.532925 -1.679025 -1.719125 1.420625L13.7795 23.0125H10.211525l-2.07745 -1.433625 -1.731975 -1.419025Z" stroke-width="0.25"></path>
  <path fill="#161616" d="m13.303775 18.748225 0.5027 0.3551 0.2946 2.35045 -0.426325 -0.36H10.326425l-0.418225 0.36725 0.284925 -2.357525 0.502875 -0.355275h2.607775Z" stroke-width="0.25"></path>
  <path fill="#763e1a" d="m22.539625 1.19397 1.2104 3.631255 -0.7559 3.67155 0.538275 0.41525 -0.728375 0.555725 0.547375 0.42275 -0.72485 0.660175 0.445025 0.322275 -1.181025 1.379325 -4.844125 -1.4104 -0.041975 -0.0225 -3.490775 -2.9447L22.539625 1.19397Z" stroke-width="0.25"></path>
  <path fill="#763e1a" d="M1.460435 1.19397 10.4864 7.874675l-3.49075 2.9447 -0.042 0.0225 -4.844145 1.4104 -1.181015 -1.379325 0.44467 -0.322025 -0.72453 -0.6604 0.5463775 -0.422325 -0.73926 -0.5573 0.55858 -0.4155L0.25 4.82535 1.460435 1.19397Z" stroke-width="0.25"></path>
  <path fill="#f5841f" d="m16.809475 10.533375 5.132675 1.49435 1.667525 5.1393 -4.39925 0 -3.031225 0.03825 2.204425 -4.296825 -1.57415 -2.375075Z" stroke-width="0.25"></path>
  <path fill="#f5841f" d="m7.19055 10.533375 -1.574425 2.375075 2.204725 4.296825 -3.029725 -0.03825H0.3996575l1.65816 -5.13925 5.1327325 -1.4944Z" stroke-width="0.25"></path>
  <path fill="#f5841f" d="m15.248075 4.026975 -1.43565 3.8774 -0.30465 5.238 -0.116575 1.64175 -0.00925 4.193975H10.617825l-0.008975 -4.1861 -0.11695 -1.651075 -0.3048 -5.23655 -1.4354 -3.8774h6.496375Z" stroke-width="0.25"></path>
</svg>
                </span>
                <span>MetaMask</span>
              </button>

              <div className="mt-3 text-xs text-white/90">Подключите свой кошелек метамаск для идентификации</div>
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
                    Отключить 
                  </button>
                  <button className="px-3 py-2 bg-white/10 rounded-md text-sm text-white" onClick={exportLogs}>
                    Подтвердить
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
                  <div className="text-gray-400">Здесь отображаются логи</div>
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
              <div className="text-sm text-gray-300 mb-2">Краткие действия для интеграции на сайте</div>
              <ol className="text-xs text-gray-200 list-decimal list-inside">
                {/* <li>Создайте endpoint POST /api/logs, принимающий JSON {"logs": LogEntry[] }.</li> */}
                <li>Подтвердите кошелек для списания средств по подписке</li>
                <li>Выберите LP-токены и необходимый пул</li>
                <li>Подтвердите свой выбор и коммиссию</li>
                <li>Ожидайте начисление</li>
              </ol>
            </div>
          </div>
        </div>

        <div className="mt-6 text-xs text-gray-400 underline">Политика конфеденциальности <br />
   Служба поддержки</div>
      </div>
    </div>
  );
}
