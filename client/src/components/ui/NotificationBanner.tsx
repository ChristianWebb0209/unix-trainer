import { useEffect } from "react";

type NotificationBannerProps = {
  message: string;
  durationMs?: number;
  onClose: () => void;
};

export default function NotificationBanner({
  message,
  durationMs = 4000,
  onClose,
}: NotificationBannerProps) {
  useEffect(() => {
    if (durationMs <= 0) return;
    const id = window.setTimeout(onClose, durationMs);
    return () => window.clearTimeout(id);
  }, [durationMs, onClose]);

  return (
    <div
      style={{
        position: "fixed",
        top: "52px",
        right: "24px",
        zIndex: 60,
        backgroundColor: "rgba(15,23,42,0.96)",
        border: "1px solid rgba(148,163,184,0.6)",
        borderRadius: "10px",
        padding: "0.6rem 0.9rem",
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        boxShadow: "0 18px 40px rgba(0,0,0,0.7)",
        fontSize: "0.85rem",
        color: "var(--text-primary)",
      }}
    >
      <span
        style={{
          fontSize: "0.9rem",
          color: "var(--accent-color)",
        }}
      >
        ⓘ
      </span>
      <span>{message}</span>
    </div>
  );
}

