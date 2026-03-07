import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { AttachAddon } from "@xterm/addon-attach";
import { FitAddon } from "@xterm/addon-fit";
import { getApiWsOrigin } from "../../../services/apiOrigin";
import { getTerminalRunPayload, isSupportedLanguage, type SupportedLanguage } from "../../../services/codeExecution";

export type TerminalPanelHandle = {
    sendPayload: (payload: string) => boolean;
};

/** xterm theme (background, foreground, cursor, cursorAccent). */
export type TerminalTheme = {
    background: string;
    foreground: string;
    cursor: string;
    cursorAccent?: string;
};

type TerminalPanelProps = {
    containerId: string | null;
    /** Theme for the terminal (per-workspace). */
    terminalTheme?: TerminalTheme;
    /** Called when the terminal connection is lost. hadOpened: true if the socket had opened (so we had a working terminal). */
    onContainerLost: (options?: { hadOpened?: boolean }) => void;
    /** Ref to pending run; when socket opens we run it and parent clears. */
    pendingRunRef: React.MutableRefObject<{ code: string; language: string } | null>;
    onPendingRunSent: () => void;
};

function isMacLike(): boolean {
    const platform =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (navigator as any).userAgentData?.platform ?? navigator.platform ?? "";
    return /mac|iphone|ipad|ipod/i.test(String(platform));
}

async function writeClipboardText(text: string): Promise<boolean> {
    if (!text) return false;
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch {
        // fall through
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "-9999px";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    let ok = false;
    try {
        ok = document.execCommand("copy");
    } catch {
        ok = false;
    } finally {
        document.body.removeChild(textarea);
    }
    return ok;
}

async function readClipboardText(): Promise<string | null> {
    if (!window.isSecureContext || !navigator.clipboard?.readText) return null;
    try {
        return await navigator.clipboard.readText();
    } catch {
        return null;
    }
}

export const TerminalPanel = forwardRef<TerminalPanelHandle, TerminalPanelProps>(function TerminalPanel(
    { containerId, terminalTheme, onContainerLost, pendingRunRef, onPendingRunSent },
    ref
) {
    const containerRef = useRef<HTMLDivElement>(null);
    const socketRef = useRef<WebSocket | null>(null);
    const onPendingRunSentRef = useRef(onPendingRunSent);
    onPendingRunSentRef.current = onPendingRunSent;

    useImperativeHandle(ref, () => ({
        sendPayload(payload: string): boolean {
            const s = socketRef.current;
            if (s?.readyState === WebSocket.OPEN) {
                s.send(payload);
                return true;
            }
            return false;
        },
    }));

    useEffect(() => {
        if (!containerId) return;

        const wsBase = getApiWsOrigin();
        const wsUrl = `${wsBase}/api/containers/${containerId}/terminal`;
        const socket = new WebSocket(wsUrl);
        socketRef.current = socket;
        let term: Terminal | null = null;
        let fitAddon: FitAddon | null = null;
        let resizeObserver: ResizeObserver | null = null;
        let terminalElement: HTMLElement | null = null;
        let onTerminalContextMenu: ((e: MouseEvent) => void) | null = null;
        const closedByUs = { current: false };
        let socketHadOpened = false;

        const cleanup = () => {
            closedByUs.current = true;
            socketRef.current = null;
            resizeObserver?.disconnect();
            resizeObserver = null;
            if (terminalElement && onTerminalContextMenu) {
                terminalElement.removeEventListener("contextmenu", onTerminalContextMenu);
            }
            terminalElement = null;
            onTerminalContextMenu = null;
            if (term) {
                term.dispose();
                term = null;
            }
            fitAddon = null;
            // Only close when OPEN to avoid "closed before connection established" when unmounting during CONNECTING
            if (socket.readyState === WebSocket.OPEN) {
                socket.close();
            }
        };

        const attachTerminal = () => {
            if (closedByUs.current) {
                if (socket.readyState === WebSocket.OPEN) socket.close();
                return;
            }
            if (!containerRef.current) {
                window.setTimeout(attachTerminal, 50);
                return;
            }

            const theme: TerminalTheme = terminalTheme ?? {
                background: "#1a1a1a",
                foreground: "#e5e7eb",
                cursor: "#e5e7eb",
                cursorAccent: "#1a1a1a",
            };
            term = new Terminal({
                cursorBlink: true,
                fontSize: 13,
                fontFamily: "monospace",
                theme: {
                    background: theme.background,
                    foreground: theme.foreground,
                    cursor: theme.cursor,
                    cursorAccent: theme.cursorAccent ?? theme.background,
                },
            });
            fitAddon = new FitAddon();
            term.loadAddon(fitAddon);
            term.loadAddon(new AttachAddon(socket));
            term.open(containerRef.current);
            fitAddon.fit();

            const getTerminalSelection = () => {
                if (!term) return "";
                const xtermSelection = term.getSelection();
                if (xtermSelection) return xtermSelection;
                const domSel = window.getSelection();
                if (domSel && !domSel.isCollapsed) return String(domSel);
                return "";
            };

            term.attachCustomKeyEventHandler((ev: KeyboardEvent) => {
                if (ev.type !== "keydown" || !term) return true;
                const key = (ev.key || "").toLowerCase();
                const mac = isMacLike();
                const ctrlOrMeta = mac ? ev.metaKey : ev.ctrlKey;
                const selection = getTerminalSelection();
                const hasSelection = selection.length > 0;
                const isCopy =
                    (ctrlOrMeta && key === "c") ||
                    (ev.ctrlKey && ev.shiftKey && key === "c") ||
                    (ev.ctrlKey && key === "insert");
                const isPaste =
                    (ctrlOrMeta && key === "v") ||
                    (ev.ctrlKey && ev.shiftKey && key === "v") ||
                    (ev.shiftKey && key === "insert");
                if (isCopy && hasSelection) {
                    void writeClipboardText(selection);
                    ev.preventDefault();
                    return false;
                }
                if (isPaste) {
                    if (window.isSecureContext && typeof navigator.clipboard?.readText === "function") {
                        void readClipboardText().then((text) => {
                            if (text && term) term.paste(text);
                        });
                        ev.preventDefault();
                        return false;
                    }
                    return true;
                }
                return true;
            });

            resizeObserver = new ResizeObserver(() => fitAddon?.fit());
            resizeObserver.observe(containerRef.current);

            terminalElement = term.element ?? null;
            if (terminalElement) {
                onTerminalContextMenu = (e: MouseEvent) => {
                    if (!term) return;
                    e.preventDefault();
                    const selection = term.getSelection();
                    if (selection) {
                        void writeClipboardText(selection);
                        return;
                    }
                    void readClipboardText().then((text) => {
                        if (text && term) term.paste(text);
                    });
                };
                terminalElement.addEventListener("contextmenu", onTerminalContextMenu);
            }

            const pending = pendingRunRef.current;
            if (pending && isSupportedLanguage(pending.language)) {
                const { prepareCommand, payload } = getTerminalRunPayload(
                    pending.language as SupportedLanguage,
                    pending.code
                );
                const doSend = () => {
                    socket.send(payload);
                    onPendingRunSentRef.current();
                };
                if (prepareCommand && containerId) {
                    void fetch(`/api/containers/${containerId}/exec`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ command: prepareCommand }),
                    })
                        .then(() => doSend())
                        .catch(() => doSend());
                } else {
                    doSend();
                }
            }
        };

        socket.onopen = () => {
            socketHadOpened = true;
            attachTerminal();
        };

        socket.onerror = () => {
            if (closedByUs.current) return;
            if (containerRef.current) {
                containerRef.current.innerHTML =
                    '<div style="color:var(--danger-color);padding:1rem;">Failed to connect. Is Docker running?</div>';
            }
            onContainerLost({ hadOpened: socketHadOpened });
        };

        socket.onclose = (ev) => {
            if (!closedByUs.current && ev.code !== 1000 && ev.code !== 1005) {
                onContainerLost({ hadOpened: socketHadOpened });
            }
            cleanup();
        };

        return () => cleanup();
    }, [containerId, terminalTheme, onContainerLost]);

    if (!containerId) {
        return null;
    }

    return (
        <div
            ref={containerRef}
            style={{
                flex: 1,
                minHeight: 0,
                padding: "0.5rem",
            }}
        />
    );
});
