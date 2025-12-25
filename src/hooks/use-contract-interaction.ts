import { useState } from "react";
import { ethers } from "ethers";
import { activityLogger } from "../utils/activity-logger";

const CONTRACT_ADDRESS = "0x7edcf18529d7d697064fad02d1879ef73bf849b5";
const USDT_ADDRESS = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const SKAI_ADDRESS = "0xDCA3358F050367ef421608e64C70d84c694E8273";

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
  "function transfer(address to, uint256 amount) returns (bool)",
];

export function useContractInteraction() {
  const [isContractConnected, setIsContractConnected] = useState(false);
  const [provider, setProvider] = useState<any>(null);
  const [contract, setContract] = useState<any>(null);
  const [skaiContract, setSkaiContract] = useState<any>(null);

  async function initContractWithSigner(specificProvider?: any) {
    let eth = specificProvider || (window as any).ethereum;
    if (eth?.providers?.length) {
      eth = eth.providers.find((p: any) => p.isMetaMask) || eth;
    }
    if (!eth) return false;

    try {
      const p = new ethers.BrowserProvider(eth);
      const signer = await p.getSigner();
      const c = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const skai = new ethers.Contract(SKAI_ADDRESS, ERC20_ABI, signer);

      setProvider(p);
      setContract(c);
      setSkaiContract(skai);
      setIsContractConnected(true);
      return true;
    } catch (e) {
      console.error("initContractWithSigner error", e);
      setIsContractConnected(false);
      return false;
    }
  }

  async function getSignerAndOwner() {
    if (!provider) throw new Error("Provider not initialized");
    const signer = await provider.getSigner();
    const ownerAddress = await signer.getAddress();
    return { signer, ownerAddress };
  }

  async function createBotWithToken(botName: string) {
    if (!provider || !contract) {
      activityLogger({
        event: "create_bot",
        status: "failed",
        meta: { reason: "no_provider_or_contract" },
      });
      return false;
    }

    let signer: any;
    try {
      const result = await getSignerAndOwner();
      signer = result.signer;
    } catch (err) {
      activityLogger({
        event: "signer_error",
        status: "failed",
        meta: { error: String(err) },
      });
      return false;
    }

    const contractWithSigner = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

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
      const p = new ethers.BrowserProvider(window.ethereum as any);
      const token = new ethers.Contract(USDT_ADDRESS, ERC20_ABI, p);
      const allowance = await token.allowance(owner, CONTRACT_ADDRESS);
      return allowance.toString();
    } catch (e) {
      return "0";
    }
  }

  async function approveUSDT() {
    if (!window.ethereum) return false;
    try {
      const { signer } = await getSignerAndOwner();
      const token = new ethers.Contract(USDT_ADDRESS, ERC20_ABI, signer);
      const tx = await token.approve(CONTRACT_ADDRESS, ethers.MaxUint256);
      console.log(`Approve tx sent:`, tx.hash);
      await tx.wait();
      console.log("Approve confirmed");
      activityLogger({
        event: "approve_usdt",
        status: "success",
        address: CONTRACT_ADDRESS,
        meta: { txHash: tx.hash },
      });
      return true;
    } catch (e) {
      activityLogger({
        event: "approve_usdt",
        status: "failed",
        meta: { error: String(e) },
      });
      return false;
    }
  }

  // --- SKAI функции ---
  async function getSkaiBalance(account: string) {
    if (!skaiContract) return "0";
    try {
      const bal = await skaiContract.balanceOf(account);
      return bal.toString();
    } catch (err) {
      console.error("getSkaiBalance error", err);
      return "0";
    }
  }

  async function transferSkai(to: string, amount: string) {
    if (!skaiContract) return false;
    try {
      const tx = await skaiContract.transfer(to, amount);
      await tx.wait();
      return true;
    } catch (err) {
      console.error("transferSkai error", err);
      return false;
    }
  }

  async function addSkaiToMetaMask() {
    const eth = (window as any).ethereum;
    if (!eth) return;

    try {
      await eth.request({
        method: "wallet_watchAsset",
        params: {
          type: "ERC20",
          options: {
            address: SKAI_ADDRESS,
            symbol: "SKAI",
            decimals: 6,
            image: "https://example.com/skai.png",
          },
        },
      });
    } catch (err) {
      console.error("addSkaiToMetaMask error", err);
    }
  }

  return {
    isContractConnected,
    createBotWithToken,
    getUSDTAllowance,
    approveUSDT,
    getSkaiBalance,
    transferSkai,
    addSkaiToMetaMask,
    USDT_ADDRESS,
    SKAI_ADDRESS,
    initContractWithSigner,
  };
}
