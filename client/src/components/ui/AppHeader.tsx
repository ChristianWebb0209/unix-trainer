import type { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { primaryPillSelected, primaryPillUnselected } from "../../uiStyles";

type AppHeaderProps = {
  children?: ReactNode;
};

export default function AppHeader({ children }: AppHeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const pathname = location.pathname;

  const isHome = pathname === "/";
  const isEditor = pathname.startsWith("/editor");
  const isAccount = pathname.startsWith("/account");

  const homeStyle = isHome ? primaryPillSelected : primaryPillUnselected;
  const editorStyle = isEditor ? primaryPillSelected : primaryPillUnselected;
  const accountStyle = isAccount ? primaryPillSelected : primaryPillUnselected;

  return (
    <header
      style={{
        height: "40px",
        backgroundColor: "var(--bg-secondary)",
        borderBottom: "1px solid var(--border-color)",
        display: "flex",
        alignItems: "center",
        padding: "0 1.5rem",
        gap: "0.75rem",
        position: "relative",
        zIndex: 30,
      }}
    >
      <button
        onClick={() => navigate("/")}
        style={{
          ...homeStyle,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.25rem",
        }}
        title="Home"
      >
        <span style={{ fontSize: "0.9rem", lineHeight: 1 }}>⌂</span>
        <span style={{ fontSize: "0.75rem" }}>Home</span>
      </button>

      <button
        onClick={() => navigate("/account")}
        style={{
          ...accountStyle,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.25rem",
        }}
        title="Account & stats"
      >
        <span style={{ fontSize: "0.9rem", lineHeight: 1 }}>👤</span>
        <span style={{ fontSize: "0.75rem" }}>Account</span>
      </button>

      <button
        onClick={() => navigate("/editor/systems")}
        style={{
          ...editorStyle,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.25rem",
        }}
        title="Open editor"
      >
        <span style={{ fontSize: "0.9rem", lineHeight: 1 }}>⌨</span>
        <span style={{ fontSize: "0.75rem" }}>Editor</span>
      </button>

      {children && (
        <div
          style={{
            marginLeft: "0.75rem",
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            flex: 1,
          }}
        >
          {children}
        </div>
      )}
    </header>
  );
}

