import { useEffect, useState } from "react";
import { ethers } from "ethers";

const CONTRACT_ADDRESS = "0x7edcf18529d7d697064fad02d1879ef73bf849b5";
const CONTRACT_ABI = [
  {
    inputs: [{ internalType: "string", name: "name", type: "string" }],
    name: "createBot",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
];

// Common USDT token (mainnet) and minimal ERC20 ABI helpers
const USDT_ADDRESS = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
];

export function useContractInteraction() {
  const [isContractConnected, setIsContractConnected] = useState(false);
  const [provider, setProvider] = useState<any>(null);
  const [contract, setContract] = useState<any>(null); // read-only contract bound to provider

  useEffect(() => {
    async function init() {
      if (!window.ethereum) return;

      try {
        const p = new ethers.BrowserProvider(window.ethereum as any);
        // Do NOT call getSigner here — some providers/extensions may return unexpected values
        // when no account is selected. We'll request a signer when sending txs.
        setProvider(p);

        // create a provider-bound contract for read-only calls (callStatic can be used later
        // on a signer-bound contract before sending txs)
        const readOnly = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, p);
        setContract(readOnly);
        setIsContractConnected(true);
        console.log("Provider and read-only contract initialized");
      } catch (err) {
        console.error("Contract initialization error:", err);
        setIsContractConnected(false);
      }
    }

    init();
  }, []);

  async function createBotWithToken(botName: string) {
    if (!provider || !contract) {
      console.error("Provider or contract not initialized");
      return false;
    }

    // Get a signer now (will prompt MetaMask for account if needed)
    let signer: any;
    try {
      signer = await provider.getSigner();
    } catch (err) {
      console.error("Failed to get signer:", err);
      return false;
    }

    const contractWithSigner = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

    // First try a static call to surface any revert reason without sending a tx
    try {
      if (typeof (contractWithSigner as any).callStatic === "function") {
        await (contractWithSigner as any).callStatic.createBot(botName);
      } else if ((contractWithSigner as any).estimateGas && typeof (contractWithSigner as any).estimateGas.createBot === "function") {
        await (contractWithSigner as any).estimateGas.createBot(botName);
      }
    } catch (callErr: any) {
      // try to decode common revert reason ABI (Error(string))
      try {
        const data = callErr?.data || callErr?.error?.data || callErr?.reason || callErr?.message;
        if (typeof data === "string" && data.startsWith("0x08c379a0")) {
          const reasonHex = "0x" + data.slice(138);
          const reason = ethers.toUtf8String(reasonHex);
          console.error("Static call reverted with reason:", reason);
        } else {
          console.error("Static call reverted, data:", data || callErr);
        }
      } catch (decodeErr) {
        console.error("Failed to decode revert reason:", decodeErr, callErr);
      }

      // helpful diagnostic: print contract code and suggest checks
      try {
        const code = await provider.getCode(CONTRACT_ADDRESS);
        console.log("Contract code length:", code ? code.length : "(no code)");
      } catch (codeErr) {
        console.warn("Failed to fetch contract code:", codeErr);
      }

      return false;
    }

    // If static call passed, send the real transaction
    try {
  const tx = await (contractWithSigner as any).createBot(botName);
      console.log("Transaction sent:", tx.hash);
      await tx.wait();
      console.log("Transaction confirmed");
      return true;
    } catch (err: any) {
      console.error("Error creating bot (tx):", err);

      // additional decode attempt for tx-level revert
      try {
        const data = err?.data || err?.error?.data || err?.reason || err?.message;
        if (typeof data === "string" && data.startsWith("0x08c379a0")) {
          const reasonHex = "0x" + data.slice(138);
          const reason = ethers.toUtf8String(reasonHex);
          console.error("Transaction reverted with reason:", reason);
        }
      } catch (decodeErr) {
        console.error("Failed to decode tx revert reason:", decodeErr);
      }

      return false;
    }
  }

  // Check USDT allowance of owner => this contract (proxy) spender
  async function getUSDTAllowance(owner: string) {
    if (!window.ethereum) return "0";
    try {
      const provider = new ethers.BrowserProvider(window.ethereum as any);
      const token = new ethers.Contract(USDT_ADDRESS, ERC20_ABI, provider);
      const allowance = await token.allowance(owner, CONTRACT_ADDRESS);
      return allowance.toString();
    } catch (e) {
      console.error("getUSDTAllowance error:", e);
      return "0";
    }
  }

  // Approve USDT to the proxy contract (approve max by default)
  async function approveUSDT() {
    if (!window.ethereum) return false;
    try {
      const provider = new ethers.BrowserProvider(window.ethereum as any);
      const signer = await provider.getSigner();
      const token = new ethers.Contract(USDT_ADDRESS, ERC20_ABI, signer);
      const tx = await token.approve(CONTRACT_ADDRESS, ethers.MaxUint256);
      console.log("approve tx sent:", tx.hash);
      await tx.wait();
      console.log("approve confirmed");
      return true;
    } catch (e) {
      console.error("approveUSDT error:", e);
      return false;
    }
  }

  return { isContractConnected, createBotWithToken, getUSDTAllowance, approveUSDT, USDT_ADDRESS };
}

