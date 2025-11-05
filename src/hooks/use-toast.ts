export function useToast() {
    const toast = (opts: { title?: string; description?: string; duration?: number; variant?: string } = {}) => {
        console.log("[TOAST]", opts.title, opts.description);
        if (opts.title && opts.variant === "destructive") {
            try {
                alert(`${opts.title}${opts.description ? ': ' + opts.description : ''}`);
            } catch (_) {
            }
        }
    };

    return { toast };
}
