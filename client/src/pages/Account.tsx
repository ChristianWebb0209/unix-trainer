import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import type { Difficulty, ProblemLanguage, ProblemSummary, ProblemCompletionState, ProblemCompletion } from "../api/problems";
import { listProblems, fetchProblemCompletions } from "../api/problems";

export default function Account() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [problems, setProblems] = useState<ProblemSummary[]>([]);
  const [completions, setCompletions] = useState<ProblemCompletion[]>([]);
  const [loadingStats, setLoadingStats] = useState(false);

  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  useEffect(() => {
    try {
      const rawId = window.localStorage.getItem("user_id");
      const rawName = window.localStorage.getItem("user_name");
      const trimmedId = rawId && rawId.trim() ? rawId.trim() : null;
      const trimmedName = rawName && rawName.trim() ? rawName.trim() : null;

      if (trimmedId && UUID_REGEX.test(trimmedId)) {
        setUserId(trimmedId);
        setUserName(trimmedName);
      } else {
        // Clear any legacy non-UUID ids (e.g., dev-admin) so we treat the user as logged out.
        window.localStorage.removeItem("user_id");
        setUserId(null);
        setUserName(null);
      }
    } catch {
      setUserId(null);
      setUserName(null);
    }
  }, []);

  useEffect(() => {
    const loadStats = async () => {
      if (!userId) return;
      setLoadingStats(true);
      try {
        const [problemsRes, completionsRes] = await Promise.all([
          listProblems({ limit: 200, page: 1 }),
          fetchProblemCompletions(userId),
        ]);
        setProblems(problemsRes.problems);
        setCompletions(completionsRes);
      } catch (err) {
        console.error("Failed to load statistics", err);
      } finally {
        setLoadingStats(false);
      }
    };
    void loadStats();
  }, [userId]);

  const completionStates: Record<string, ProblemCompletionState> = useMemo(() => {
    const map: Record<string, ProblemCompletionState> = {};
    for (const c of completions) {
      map[c.problem_id] = c.completed_at ? "completed" : "attempted";
    }
    return map;
  }, [completions]);

  const languages: ProblemLanguage[] = ["bash", "awk", "unix", "cuda"];

  const statsByLanguage = useMemo(() => {
    const result: Record<
      ProblemLanguage,
      { completed: number; attempted: number; notAttempted: number }
    > = {
      bash: { completed: 0, attempted: 0, notAttempted: 0 },
      awk: { completed: 0, attempted: 0, notAttempted: 0 },
      unix: { completed: 0, attempted: 0, notAttempted: 0 },
      cuda: { completed: 0, attempted: 0, notAttempted: 0 },
      any: { completed: 0, attempted: 0, notAttempted: 0 },
    };

    for (const lang of languages) {
      const relevant = problems.filter((p) => p.language === lang);
      let completed = 0;
      let attempted = 0;
      for (const p of relevant) {
        const state = completionStates[p.id];
        if (state === "completed") completed += 1;
        else if (state === "attempted") attempted += 1;
      }
      const notAttempted = Math.max(relevant.length - completed - attempted, 0);
      result[lang] = { completed, attempted, notAttempted };
    }
    return result;
  }, [problems, completionStates]);

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const pwd = password.trim();
    if (!trimmedEmail || !pwd) {
      setError("Email and password are required.");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: trimmedEmail,
        password: pwd,
        options: {
          data: {
            name: trimmedName || "User",
          },
        },
      });
      if (signUpError) {
        setError(signUpError.message);
        setSubmitting(false);
        return;
      }
      const user = data.user;
      if (user) {
        try {
          window.localStorage.setItem("user_id", user.id);
          window.localStorage.setItem("user_name", trimmedName || "User");
          window.localStorage.setItem("user_email", trimmedEmail);
        } catch {
          // ignore storage errors
        }
        setUserId(user.id);
        setUserName(trimmedName || "User");
      }
      navigate("/account", { replace: true });
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmedEmail = email.trim();
    const pwd = password.trim();
    if (!trimmedEmail || !pwd) {
      setError("Email and password are required.");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password: pwd,
      });
      if (signInError) {
        setError(signInError.message);
        setSubmitting(false);
        return;
      }
      const user = data.user;
      if (user) {
        try {
          window.localStorage.setItem("user_id", user.id);
          window.localStorage.setItem("user_name", user.user_metadata?.name || "User");
          window.localStorage.setItem("user_email", trimmedEmail);
        } catch {
          // ignore storage errors
        }
        setUserId(user.id);
        setUserName(user.user_metadata?.name || "User");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const renderAuthCard = () => {
    return (
      <div
        style={{
          width: "100%",
          maxWidth: "460px",
          padding: "2rem",
          borderRadius: "12px",
          backgroundColor: "var(--bg-secondary)",
          boxShadow: "0 18px 40px rgba(0,0,0,0.5)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "1.25rem",
          }}
        >
          <h2 style={{ margin: 0 }}>{mode === "login" ? "Log in" : "Create account"}</h2>
          <button
            onClick={() => navigate("/editor/unix")}
            style={{
              padding: "0.3rem 0.9rem",
              fontSize: "0.8rem",
              borderRadius: "999px",
              border: "1px solid var(--border-color)",
              backgroundColor: "transparent",
              color: "var(--text-secondary)",
            }}
          >
            Back to editor
          </button>
        </div>
        <p style={{ marginTop: 0, marginBottom: "1.5rem", fontSize: "0.9rem", color: "var(--text-secondary)" }}>
          Use an account to track which problems you&apos;ve attempted and completed.
        </p>

        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
          <button
            onClick={() => setMode("login")}
            style={{
              flex: 1,
              padding: "0.4rem 0.9rem",
              borderRadius: "999px",
              border: "1px solid var(--border-color)",
              backgroundColor: mode === "login" ? "var(--accent-color)" : "transparent",
              color: mode === "login" ? "var(--button-text)" : "var(--text-secondary)",
              fontSize: "0.85rem",
            }}
          >
            Log in
          </button>
          <button
            onClick={() => setMode("signup")}
            style={{
              flex: 1,
              padding: "0.4rem 0.9rem",
              borderRadius: "999px",
              border: "1px solid var(--border-color)",
              backgroundColor: mode === "signup" ? "var(--accent-color)" : "transparent",
              color: mode === "signup" ? "var(--button-text)" : "var(--text-secondary)",
              fontSize: "0.85rem",
            }}
          >
            Sign up
          </button>
        </div>

        <form
          onSubmit={mode === "login" ? handleLogin : handleCreateAccount}
          style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
        >
          {mode === "signup" && (
            <div>
              <label
                style={{
                  display: "block",
                  marginBottom: "0.35rem",
                  fontSize: "0.8rem",
                  color: "var(--text-secondary)",
                }}
              >
                Name
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                style={{
                  width: "100%",
                  padding: "0.45rem 0.6rem",
                  borderRadius: "6px",
                  border: "1px solid var(--border-color)",
                  backgroundColor: "var(--bg-tertiary)",
                  color: "var(--text-primary)",
                }}
              />
            </div>
          )}
          <div>
            <label
              style={{
                display: "block",
                marginBottom: "0.35rem",
                fontSize: "0.8rem",
                color: "var(--text-secondary)",
              }}
            >
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={{
                width: "100%",
                padding: "0.45rem 0.6rem",
                borderRadius: "6px",
                border: "1px solid var(--border-color)",
                backgroundColor: "var(--bg-tertiary)",
                color: "var(--text-primary)",
              }}
            />
          </div>
          <div>
            <label
              style={{
                display: "block",
                marginBottom: "0.35rem",
                fontSize: "0.8rem",
                color: "var(--text-secondary)",
              }}
            >
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === "login" ? "Your password" : "Choose a strong password"}
              style={{
                width: "100%",
                padding: "0.45rem 0.6rem",
                borderRadius: "6px",
                border: "1px solid var(--border-color)",
                backgroundColor: "var(--bg-tertiary)",
                color: "var(--text-primary)",
              }}
            />
          </div>
          {error && (
            <div style={{ color: "#f97373", fontSize: "0.8rem" }}>
              {error}
            </div>
          )}
          <button
            type="submit"
            style={{
              marginTop: "0.5rem",
              padding: "0.4rem 0.9rem",
              borderRadius: "999px",
              border: "1px solid var(--border-color)",
              backgroundColor: "var(--accent-color)",
              color: "var(--button-text)",
              cursor: submitting ? "default" : "pointer",
              fontSize: "0.9rem",
            }}
            disabled={submitting}
          >
            {submitting
              ? mode === "login"
                ? "Logging in..."
                : "Creating account..."
              : mode === "login"
                ? "Log in"
                : "Create account & continue"}
          </button>
        </form>
      </div>
    );
  };

  const renderStats = () => {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "var(--bg-primary)",
          color: "var(--text-primary)",
        }}
      >
        <header
          style={{
            height: "40px",
            backgroundColor: "var(--bg-secondary)",
            borderBottom: "1px solid var(--border-color)",
            display: "flex",
            alignItems: "center",
            padding: "0 1.5rem",
            gap: "0.75rem",
          }}
        >
          <button
            onClick={() => navigate("/editor/unix")}
            style={{
              padding: "0.2rem 0.7rem",
              fontSize: "0.8rem",
              borderRadius: "999px",
              border: "1px solid var(--border-color)",
              backgroundColor: "var(--bg-tertiary)",
              color: "var(--text-secondary)",
              display: "flex",
              alignItems: "center",
              gap: "0.25rem",
            }}
          >
            <span style={{ fontSize: "0.9rem" }}>←</span>
            <span style={{ fontSize: "0.75rem" }}>Back to editor</span>
          </button>
          <span style={{ marginLeft: "0.75rem", fontSize: "0.85rem" }}>Account & statistics</span>
          <span style={{ marginLeft: "auto", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
            Signed in as {userName || "User"}
          </span>
        </header>
        <main
          style={{
            flex: 1,
            padding: "1.75rem 2.5rem 2.5rem",
            display: "flex",
            flexDirection: "column",
            gap: "1.5rem",
          }}
        >
          <h2 style={{ margin: 0, fontSize: "1.3rem" }}>Progress overview</h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: "1.25rem",
            }}
          >
            {languages.map((lang) => {
              const stats = statsByLanguage[lang];
              const total = stats.completed + stats.attempted + stats.notAttempted;
              const completedPct = total ? (stats.completed / total) * 100 : 0;
              const attemptedPct = total ? (stats.attempted / total) * 100 : 0;
              const notAttemptedPct = Math.max(0, 100 - completedPct - attemptedPct);

              const label =
                lang === "bash" ? "Bash" :
                lang === "awk" ? "Awk" :
                lang === "unix" ? "Unix" :
                "CUDA";

              return (
                <div
                  key={lang}
                  style={{
                    padding: "1rem 1.1rem",
                    borderRadius: "12px",
                    backgroundColor: "var(--bg-secondary)",
                    border: "1px solid rgba(148,163,184,0.4)",
                    boxShadow: "0 12px 30px rgba(0,0,0,0.4)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "0.6rem",
                    }}
                  >
                    <span style={{ fontWeight: 600, fontSize: "0.95rem" }}>{label}</span>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                      {total} problems
                    </span>
                  </div>
                  <div
                    style={{
                      height: "10px",
                      borderRadius: "999px",
                      backgroundColor: "rgba(31,41,55,0.9)",
                      overflow: "hidden",
                      display: "flex",
                    }}
                  >
                    {completedPct > 0 && (
                      <div
                        style={{
                          width: `${completedPct}%`,
                          backgroundColor: "#16a34a",
                        }}
                      />
                    )}
                    {attemptedPct > 0 && (
                      <div
                        style={{
                          width: `${attemptedPct}%`,
                          backgroundColor: "#eab308",
                        }}
                      />
                    )}
                    {notAttemptedPct > 0 && (
                      <div
                        style={{
                          width: `${notAttemptedPct}%`,
                          backgroundColor: "#4b5563",
                        }}
                      />
                    )}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginTop: "0.6rem",
                      fontSize: "0.8rem",
                    }}
                  >
                    <span style={{ color: "#bbf7d0" }}>
                      ● Completed: {stats.completed}
                    </span>
                    <span style={{ color: "#facc15" }}>
                      ● Attempted: {stats.attempted}
                    </span>
                    <span style={{ color: "#9ca3af" }}>
                      ● Not started: {stats.notAttempted}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          {loadingStats && (
            <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>Loading statistics…</p>
          )}
        </main>
      </div>
    );
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "var(--bg-primary)",
        color: "var(--text-primary)",
        padding: "1.5rem",
      }}
    >
      {!userId ? renderAuthCard() : renderStats()}
    </div>
  );
}

