import { useMemo, useState, useEffect, useRef } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { cpp } from "@codemirror/lang-cpp";
import { rust } from "@codemirror/lang-rust";
import { StreamLanguage, indentUnit } from "@codemirror/language";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { LSPClient, languageServerExtensions } from "@codemirror/lsp-client";
import type { Extension } from "@codemirror/state";
import type { CSSProperties } from "react";
import * as problemConfig from "problem-config";
import { simpleWebSocketTransport } from "../../services/lspTransport";
import {
    isLspSupported,
    getLspFileUri,
    getLspLanguageId,
} from "../../services/lspFileUri";

const shellLanguage = StreamLanguage.define(shell);

function getLanguageExtension(lang: string): Extension[] {
    const id = lang.toLowerCase();
    if (id === "rust") return [rust()];
    if ((problemConfig.SHELL_LANGUAGE_IDS as readonly string[]).includes(id)) {
        return [shellLanguage, indentUnit.of("  ")];
    }
    if ((problemConfig.C_LIKE_LANGUAGE_IDS as readonly string[]).includes(id)) return [cpp()];
    return [cpp()];
}

function getLspWebSocketUrl(containerId: string, language: string): string {
    const protocol = typeof window !== "undefined" && window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = typeof window !== "undefined" ? window.location.host : "localhost:3000";
    return `${protocol}//${host}/api/containers/${containerId}/lsp?language=${encodeURIComponent(language)}`;
}

type CodeEditorPaneProps = {
    code: string;
    onChange: (next: string) => void;
    onRun: () => void;
    theme: Extension;
    language?: string;
    containerId: string | null;
    isRunning: boolean;
    isCreatingContainer: boolean;
    isValidating: boolean;
    runButtonStyle: CSSProperties;
};

export function CodeEditorPane({
    code,
    onChange,
    onRun,
    theme,
    language = "bash",
    containerId,
    isRunning,
    isCreatingContainer,
    isValidating,
    runButtonStyle,
}: CodeEditorPaneProps) {
    const [lspExtension, setLspExtension] = useState<Extension | null>(null);
    const lspClientRef = useRef<LSPClient | null>(null);

    useEffect(() => {
        if (!containerId || !language || !isLspSupported(language)) {
            if (lspClientRef.current) {
                lspClientRef.current.disconnect();
                lspClientRef.current = null;
            }
            setLspExtension(null);
            return;
        }

        const uri = getLspFileUri(language);
        const languageId = getLspLanguageId(language);
        const url = getLspWebSocketUrl(containerId, language);

        let cancelled = false;
        simpleWebSocketTransport(url)
            .then((transport) => {
                if (cancelled) return;
                const client = new LSPClient({
                    extensions: languageServerExtensions(),
                }).connect(transport);
                lspClientRef.current = client;
                setLspExtension(client.plugin(uri, languageId));
            })
            .catch((err) => {
                if (!cancelled) console.warn("[LSP] Failed to connect:", err);
            });

        return () => {
            cancelled = true;
            if (lspClientRef.current) {
                lspClientRef.current.disconnect();
                lspClientRef.current = null;
            }
            setLspExtension(null);
        };
    }, [containerId, language]);

    const extensions = useMemo(() => {
        const base = getLanguageExtension(language);
        return lspExtension ? [...base, lspExtension] : base;
    }, [language, lspExtension]);

    const renderLabel = () => {
        if (isValidating) return "Validating...";
        if (isCreatingContainer) return "Starting...";
        if (isRunning) return "Running...";
        return "Run Code";
    };

    return (
        <div style={{ height: "100%", position: "relative", overflow: "hidden" }}>
            <CodeMirror
                value={code}
                height="100%"
                theme={theme}
                basicSetup={{
                    indentOnInput: true,
                    autocompletion: true,
                    defaultKeymap: true,
                    completionKeymap: true,
                    bracketMatching: true,
                    closeBrackets: true,
                    tabSize: 4,
                }}
                extensions={extensions}
                onChange={onChange}
                indentWithTab={true}
                style={{ fontSize: "16px", height: "100%" }}
            />
            <button
                onClick={onRun}
                disabled={isRunning || isCreatingContainer || isValidating}
                style={{
                    position: "absolute",
                    bottom: "10px",
                    left: "10px",
                    zIndex: 10,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.4rem",
                    ...runButtonStyle,
                }}
            >
                <span>{renderLabel()}</span>
                {!isRunning && !isCreatingContainer && !isValidating && (
                    <span
                        style={{
                            fontSize: "0.75rem",
                            opacity: 0.7,
                        }}
                    >
                        Ctrl+'
                    </span>
                )}
            </button>
            {(() => {
                const langId = language.toLowerCase();
                const entry = (problemConfig.PROBLEM_LANGUAGES as Record<string, { docs?: string | null }>)[langId];
                const docsUrl = entry?.docs;
                if (!docsUrl) return null;
                return (
                    <a
                        href={docsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                            position: "absolute",
                            bottom: "10px",
                            right: "10px",
                            zIndex: 10,
                            fontSize: "0.7rem",
                            color: "var(--text-secondary, #888)",
                            opacity: 0.8,
                            textDecoration: "none",
                        }}
                    >
                        Language docs
                    </a>
                );
            })()}
        </div>
    );
}

