export function useToast() {
    const toast = (opts: { title?: string; description?: string; duration?: number; variant?: string } = {}) => {
        console.log("[TOAST]", opts.title, opts.description);
        try {
            // Emit a global event so page-level toast UIs can listen and render.
            if (typeof window !== "undefined" && (window as any).dispatchEvent) {
                window.dispatchEvent(new CustomEvent("app:toast", { detail: opts }));
            }
        } catch (e) {
            // fallback to console
            console.log("toast event dispatch failed", e);
        }
    };

    return { toast };
}
