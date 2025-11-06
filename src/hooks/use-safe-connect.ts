

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
