import CodeMirror from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";
import type { Extension } from "@codemirror/state";
import type { CSSProperties } from "react";

type CodeEditorPaneProps = {
    code: string;
    onChange: (next: string) => void;
    onRun: () => void;
    theme: Extension;
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
    isRunning,
    isCreatingContainer,
    isValidating,
    runButtonStyle,
}: CodeEditorPaneProps) {
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
                extensions={[python()]}
                onChange={onChange}
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
        </div>
    );
}

