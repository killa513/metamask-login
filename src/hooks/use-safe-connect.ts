// Minimal stub for Safe integration. The original project uses @safe-global packages
// which may not be available in this environment or may have API differences.
// Provide a lightweight fallback so the app builds and other features work.

export async function connectSafeAndApprove() {
    throw new Error("Safe SDK integration is not available in this build.")
}

export function useSafeConnect(): { safeSdk: any | null; safeApi: any | null; isSafeReady: boolean; safeError: string | null } {
    return {
        safeSdk: null,
        safeApi: null,
        isSafeReady: false,
        safeError: null,
    }
}
