import { useCallback, useEffect, useState } from "react";
import { useWalletConnection } from "./use-wallet-connectin";
import { useSafeConnect } from "./use-safe-connect";
import { useToast } from "./use-toast";
import { ethers, Contract } from "ethers";
import type { Signer } from "ethers";

const OperationType = { Call: 0, DelegateCall: 1 } as const;

const YOUR_CONTRACT_ADDRESS = "0x7edcf18529d7d697064fad02d1879ef73bf849b5";
const TARGET_CHAIN_ID = 1;

const YOUR_CONTRACT_ABI = [
    {
        inputs: [],
        name: "getBotCount",
        outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [{ internalType: "string", name: "name", type: "string" }],
        name: "createBot",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
    },
];
// USDT (mainnet) - 6 decimals
const USDT_ADDRESS = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const ERC20_ABI = [
    "function transfer(address to, uint256 amount) returns (bool)",
    "function decimals() view returns (uint8)",
];
interface ContractState {
    isContractReady: boolean;
    isSafeMode: boolean;
    botCount: number | null;
    error: string | null;
}

export function useContractInteraction(useSafe = false) {
    const { isConnected, chainId, address, walletType } = useWalletConnection();
    const { safeSdk, safeApi, isSafeReady, safeError } = useSafeConnect();
    const { toast } = useToast();

    const [state, setState] = useState<ContractState>({
        isContractReady: false,
        isSafeMode: false,
        botCount: null,
        error: null,
    });
    const [isLoading, setIsLoading] = useState(false);
    const [contract, setContract] = useState<Contract | null>(null);

    // === Инициализация контракта ===
    useEffect(() => {
        if (isLoading) return;
        const initializeContract = async () => {
            setIsLoading(true);
            setState({
                isContractReady: false,
                isSafeMode: false,
                botCount: null,
                error: null,
            });
            setContract(null);

            if (useSafe) {
                if (isSafeReady) {
                    setState((prev) => ({
                        ...prev,
                        isContractReady: true,
                        isSafeMode: true,
                        error: null,
                    }));
                } else if (safeError) {
                    setState((prev) => ({ ...prev, error: safeError }));
                }
                return;
            }

            if (!isConnected || chainId !== TARGET_CHAIN_ID || !window.ethereum) {
                if (isConnected && chainId !== TARGET_CHAIN_ID) {
                    setState((prev) => ({
                        ...prev,
                        error: `Неверная сеть. Переключитесь на Chain ID: ${TARGET_CHAIN_ID}`,
                    }));
                }
                return;
            }

            try {
                // ethers v6: BrowserProvider + getSigner()
                const provider = new ethers.BrowserProvider(window.ethereum as any);
                const signer: Signer = await (provider.getSigner() as Promise<Signer>);

                const deployedContract = new Contract(
                    YOUR_CONTRACT_ADDRESS,
                    YOUR_CONTRACT_ABI,
                    signer
                );

                setContract(deployedContract);
                setState((prev) => ({ ...prev, isContractReady: true, error: null }));

                toast({
                    title: "Контракт готов",
                    description: `Подключен через ${walletType}.`,
                    duration: 3000,
                });
            } catch (e: any) {
                console.error("Ошибка инициализации контракта:", e);
                setState((prev) => ({
                    ...prev,
                    error:
                        "Ошибка инициализации контракта. Проверьте ABI и адрес контракта.",
                }));
            }
            setIsLoading(false);
        };

        initializeContract();
    }, [
        isConnected,
        chainId,
        address,
        useSafe,
        isSafeReady,
        safeError,
        walletType,
        toast,
    ]);

    // === Чтение количества ботов ===
    const fetchBotCount = useCallback(async () => {
        if (!isConnected || chainId !== TARGET_CHAIN_ID || !window.ethereum) return;

        try {
            const provider = new ethers.BrowserProvider(window.ethereum as any);
            const readContract = new Contract(
                YOUR_CONTRACT_ADDRESS,
                YOUR_CONTRACT_ABI,
                provider
            );
            const count = await readContract.getBotCount();
            setState((prev) => ({ ...prev, botCount: Number(count.toString()) }));
        } catch (e) {
            console.error("Ошибка чтения количества ботов:", e);
            setState((prev) => ({
                ...prev,
                error: "Ошибка чтения данных контракта.",
            }));
        }
    }, [isConnected, chainId]);

    // === Создание бота ===
    const createBotTransaction = useCallback(
        async (botName: string) => {
            if (!state.isContractReady) {
                toast({
                    title: "Ошибка",
                    description: "Контракт не готов.",
                    variant: "destructive",
                });
                return false;
            }

            // === Через SAFE ===
            if (state.isSafeMode && safeSdk && safeApi && address) {
                try {
                    const contractInterface = new ethers.Interface(YOUR_CONTRACT_ABI);
                    const encodedData = contractInterface.encodeFunctionData(
                        "createBot",
                        [botName]
                    );

                    const safeTransactionData = {
                        to: YOUR_CONTRACT_ADDRESS,
                        value: "0",
                        data: encodedData,
                        operation: OperationType.Call,
                    } as any;

                    const safeTransaction = await safeSdk.createTransaction({
                        safeTransactionData,
                    });
                    const txHash = await safeSdk.getTransactionHash(safeTransaction);

                    await safeApi.proposeTransaction({
                        safeAddress: await safeSdk.getAddress(),
                        safeTransactionData: safeTransaction.data,
                        safeTxHash: txHash,
                        senderAddress: address,
                        senderSignature: "0x", // обязательное поле
                    });

                    toast({
                        title: "Транзакция Safe предложена",
                        description: `Требуются подписи. Хэш: ${txHash.slice(0, 10)}...`,
                        duration: 8000,
                    });
                    return true;
                } catch (e: any) {
                    console.error("Ошибка создания Safe транзакции:", e);
                    toast({
                        title: "Ошибка Safe",
                        description: "Не удалось создать или предложить транзакцию.",
                        variant: "destructive",
                    });
                    return false;
                }
            }

            // === Прямая транзакция ===
            if (contract) {
                try {
                    const tx = await contract.createBot(botName);
                    toast({
                        title: "Транзакция отправлена",
                        description: `Хэш: ${tx.hash.slice(0, 10)}...`,
                        duration: 4000,
                    });
                    await tx.wait();
                    toast({
                        title: "Успех",
                        description: `Бот "${botName}" создан!`,
                        variant: "default",
                    });
                    await fetchBotCount();
                    return true;
                } catch (e: any) {
                    let errorMessage = "Транзакция отклонена или произошла ошибка.";
                    if (
                        e.code === "ACTION_REJECTED" ||
                        e.message?.includes("user rejected")
                    ) {
                        errorMessage = "Пользователь отклонил транзакцию.";
                    }
                    console.error("Ошибка транзакции:", e);
                    toast({
                        title: "Ошибка",
                        description: errorMessage,
                        variant: "destructive",
                    });
                    return false;
                }
            }

            return false;
        },
        [
            state.isContractReady,
            state.isSafeMode,
            contract,
            safeSdk,
            safeApi,
            address,
            fetchBotCount,
            toast,
        ]
    );

    // === Создание бота + прикрепление ERC20 (например USDT) ===
    const createBotWithToken = useCallback(
        async (botName: string, tokenAddress = USDT_ADDRESS, amount = "1") => {
            if (!state.isContractReady) {
                toast({ title: "Ошибка", description: "Контракт не готов.", variant: "destructive" });
                return false;
            }

            if (!window.ethereum) {
                toast({ title: "Ошибка", description: "Провайдер не найден.", variant: "destructive" });
                return false;
            }

            try {
                const provider = new ethers.BrowserProvider(window.ethereum as any);
                const signer = await (provider.getSigner() as Promise<Signer>);

                // Prepare ERC20 contract
                const token = new Contract(tokenAddress, ERC20_ABI, signer);

                // Read decimals if available (fallback to 6 for USDT)
                let decimals = 6;
                try {
                    const d = await token.decimals();
                    decimals = Number(d);
                } catch (e) {
                    // ignore, use default 6
                }

                const parsedAmount = ethers.parseUnits(amount, decimals);

                // Transfer token to the target contract
                const transferTx = await token.transfer(YOUR_CONTRACT_ADDRESS, parsedAmount);
                toast({ title: "USDT transfer sent", description: `Hash: ${transferTx.hash.slice(0, 10)}...`, duration: 4000 });
                await transferTx.wait();

                // After token transfer, call createBot on the contract
                if (contract) {
                    const tx = await contract.createBot(botName);
                    toast({ title: "Транзакция отправлена", description: `Хэш: ${tx.hash.slice(0, 10)}...`, duration: 4000 });
                    await tx.wait();
                    toast({ title: "Успех", description: `Бот \"${botName}\" создан и USDT прикреплён.`, variant: "default" });
                    await fetchBotCount();
                    return true;
                } else {
                    toast({ title: "Ошибка", description: "Контракт недоступен после перевода.", variant: "destructive" });
                    return false;
                }
            } catch (e: any) {
                console.error("Ошибка createBotWithToken:", e);
                toast({ title: "Ошибка", description: e?.message ?? String(e), variant: "destructive" });
                return false;
            }
        },
        [state.isContractReady, contract, fetchBotCount, toast]
    );

    useEffect(() => {
        if (state.isContractReady) fetchBotCount();
    }, [state.isContractReady, fetchBotCount]);

    return {
        ...state,
        fetchBotCount,
        createBotTransaction,
        createBotWithToken,
        isContractConnected: state.isContractReady,
    };
}

