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
import { getApiWsOrigin } from "../../services/apiOrigin";
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
    const base = typeof window !== "undefined" ? getApiWsOrigin() : "ws://localhost:3000";
    return `${base}/api/containers/${containerId}/lsp?language=${encodeURIComponent(language)}`;
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
                    timeout: 60_000,
                }).connect(transport);
                lspClientRef.current = client;
                const plugin = client.plugin(uri, languageId);
                setLspExtension(plugin);
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
            {lspExtension && (
                <span
                    title="IntelliSense is on: autocomplete (Ctrl+Space), hover for docs, Ctrl+Click to go to definition"
                    style={{
                        position: "absolute",
                        top: "8px",
                        right: "8px",
                        zIndex: 10,
                        fontSize: "0.7rem",
                        color: "var(--text-secondary, #888)",
                        opacity: 0.9,
                        padding: "0.2rem 0.5rem",
                        borderRadius: "4px",
                        backgroundColor: "var(--bg-tertiary, rgba(0,0,0,0.2))",
                    }}
                >
                    IntelliSense on
                </span>
            )}
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

