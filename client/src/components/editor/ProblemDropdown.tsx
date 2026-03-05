import { useEffect, useRef } from "react";
import Sidebar from "./Sidebar.tsx";
import { primaryPillUnselected } from "../../uiStyles";
import type { ProblemSummary, ProblemCompletionState } from "../../api/problems";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error – external ESM config module without bundled types
import * as problemConfig from "../../../../problem-config.mjs";

type Workspace = ReturnType<typeof problemConfig.getWorkspaceIds>[number];

export interface ProblemDropdownProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    selectedProblemId: string | null;
    onSelectProblem: (problem: ProblemSummary) => void | Promise<void>;
    onProblemsLoaded: (problems: ProblemSummary[], workspace: Workspace) => void;
    completionStatuses: Record<string, ProblemCompletionState>;
    workspace: Workspace;
}

export default function ProblemDropdown({
    isOpen,
    onOpenChange,
    selectedProblemId,
    onSelectProblem,
    onProblemsLoaded,
    completionStatuses,
    workspace,
}: ProblemDropdownProps) {
    const overlayRef = useRef<HTMLDivElement | null>(null);
    const toggleButtonRef = useRef<HTMLButtonElement | null>(null);

    // Close when clicking outside overlay and toggle
    useEffect(() => {
        if (!isOpen) return;
        const handleClick = (event: MouseEvent) => {
            const overlay = overlayRef.current;
            const toggle = toggleButtonRef.current;
            const target = event.target as Node | null;
            if (!overlay || !target) return;
            if (overlay.contains(target)) return;
            if (toggle && toggle.contains(target)) return;
            onOpenChange(false);
        };
        window.addEventListener("mousedown", handleClick);
        return () => window.removeEventListener("mousedown", handleClick);
    }, [isOpen, onOpenChange]);

    const handleSelect = async (p: ProblemSummary) => {
        await onSelectProblem(p);
        onOpenChange(false);
    };

    return (
        <>
            <button
                ref={toggleButtonRef}
                type="button"
                onClick={() => onOpenChange(!isOpen)}
                style={{
                    marginLeft: "0.5rem",
                    ...primaryPillUnselected,
                }}
            >
                Problems {isOpen ? "▲" : "▼"}
            </button>
            {/* Only mount overlay when open so it never blocks header controls (e.g. language select) */}
            {isOpen && (
                <div
                    ref={overlayRef}
                    style={{
                        position: "fixed",
                        top: "40px",
                        left: 0,
                        zIndex: 25,
                        display: "flex",
                        alignItems: "flex-start",
                    }}
                >
                    <div
                        style={{
                            marginLeft: "12rem",
                            marginTop: "0.5rem",
                            width: "360px",
                            height: "70vh",
                            borderRadius: "10px",
                            boxShadow: "0 18px 40px rgba(0,0,0,0.6)",
                            overflow: "hidden",
                            backgroundColor: "var(--bg-secondary)",
                        }}
                    >
                        <Sidebar
                            selectedProblemId={selectedProblemId}
                            onSelectProblem={handleSelect}
                            onProblemsLoaded={onProblemsLoaded}
                            completionStatuses={completionStatuses}
                            workspace={workspace}
                            showHeader={false}
                        />
                    </div>
                </div>
            )}
        </>
    );
}
