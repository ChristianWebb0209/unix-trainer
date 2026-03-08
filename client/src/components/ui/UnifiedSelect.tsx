import { useEffect, useRef, useState } from "react";
import { unifiedSelectTriggerStyle } from "../../uiStyles";

export type UnifiedSelectOption = { value: string; label: string };

type UnifiedSelectProps = {
    value: string;
    onChange: (value: string) => void;
    options: UnifiedSelectOption[];
    disabled?: boolean;
    placeholder?: string;
    /** If true, trigger takes full width of container. */
    fullWidth?: boolean;
    /** Optional id for the trigger (e.g. for labels). */
    id?: string;
};

const pillOptionStyle = {
    padding: "0.35rem 0.65rem",
    borderRadius: "999px",
    border: "1px solid var(--border-color)",
    background: "var(--bg-tertiary)",
    color: "var(--text-primary)",
    fontSize: "0.8rem",
    cursor: "pointer" as const,
    width: "100%" as const,
    textAlign: "left" as const,
    marginBottom: 0,
    outline: "none",
    boxSizing: "border-box" as const,
    boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
};

export default function UnifiedSelect({
    value,
    onChange,
    options,
    disabled = false,
    placeholder = "Select…",
    fullWidth = false,
    id,
}: UnifiedSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const selectedOption = options.find((o) => o.value === value);
    const displayLabel = selectedOption?.label ?? placeholder;
    const showArrow = options.length > 1;

    useEffect(() => {
        if (!isOpen) return;
        const handleClick = (e: MouseEvent) => {
            if (containerRef.current?.contains(e.target as Node)) return;
            setIsOpen(false);
        };
        window.addEventListener("mousedown", handleClick);
        return () => window.removeEventListener("mousedown", handleClick);
    }, [isOpen]);

    const handleSelect = (newValue: string) => {
        onChange(newValue);
        setIsOpen(false);
    };

    return (
        <div
            ref={containerRef}
            style={{
                position: "relative",
                width: fullWidth ? "100%" : "auto",
                flex: fullWidth ? 1 : undefined,
            }}
        >
            <button
                id={id}
                type="button"
                disabled={disabled}
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                aria-label={displayLabel}
                onClick={() => !disabled && options.length > 1 && setIsOpen((o) => !o)}
                style={{
                    ...unifiedSelectTriggerStyle,
                    width: fullWidth ? "100%" : undefined,
                    opacity: disabled ? 0.7 : 1,
                    cursor: disabled || options.length <= 1 ? "default" : "pointer",
                }}
            >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {displayLabel}
                </span>
                {showArrow && (
                    <span style={{ flexShrink: 0, fontSize: "0.65rem", lineHeight: 1 }} aria-hidden>
                        {isOpen ? "▲" : "▼"}
                    </span>
                )}
            </button>
            {isOpen && (
                <div
                    role="listbox"
                    aria-activedescendant={value ? `option-${value}` : undefined}
                    style={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        top: "100%",
                        marginTop: "0.4rem",
                        zIndex: 50,
                        maxHeight: "min(280px, 50vh)",
                        overflowY: "auto",
                        overflowX: "hidden",
                    }}
                >
                    {options.map((opt) => {
                        const isSelected = value === opt.value;
                        return (
                            <button
                                key={opt.value}
                                type="button"
                                role="option"
                                id={isSelected ? `option-${opt.value}` : undefined}
                                aria-selected={isSelected}
                                onClick={() => handleSelect(opt.value)}
                                style={{
                                    ...pillOptionStyle,
                                    backgroundColor: isSelected ? "var(--accent-color)" : "var(--bg-tertiary)",
                                    color: isSelected ? "var(--button-text)" : "var(--text-primary)",
                                    borderColor: isSelected ? "var(--accent-color)" : "var(--border-color)",
                                }}
                                onMouseEnter={(e) => {
                                    if (!isSelected) {
                                        e.currentTarget.style.backgroundColor = "var(--border-color)";
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = isSelected ? "var(--accent-color)" : "var(--bg-tertiary)";
                                }}
                            >
                                {opt.label}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
