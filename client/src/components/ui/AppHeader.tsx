import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../../supabaseClient";
import { primaryPillSelected, primaryPillUnselected } from "../../uiStyles";

type AppHeaderProps = {
  children?: ReactNode;
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function useAuthLabel(): string {
  const [label, setLabel] = useState<string>("Sign in");

  useEffect(() => {
    const update = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const name = session.user.user_metadata?.name;
        const email = session.user.email;
        setLabel(name || email?.split("@")[0] || "User");
        return;
      }
      const rawId = window.localStorage.getItem("user_id");
      const rawName = window.localStorage.getItem("user_name");
      if (rawId && UUID_REGEX.test(rawId.trim())) {
        const name = rawName?.trim();
        setLabel(name || "User");
      } else {
        setLabel("Sign in");
      }
    };
    void update();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      void update();
    });
    return () => subscription.unsubscribe();
  }, []);

  return label;
}

export default function AppHeader({ children }: AppHeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const pathname = location.pathname;
  const accountLabel = useAuthLabel();

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
        title={accountLabel === "Sign in" ? "Sign in" : "Account & stats"}
      >
        <span style={{ fontSize: "0.9rem", lineHeight: 1 }}>\o/</span>
        <span style={{ fontSize: "0.75rem" }}>{accountLabel}</span>
      </button>

      <button
        onClick={() => navigate("/editor/kernel")}
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

