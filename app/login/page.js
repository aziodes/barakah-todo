"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const params = useSearchParams();

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setBusy(false);
    if (res.ok) {
      router.push(params.get("from") || "/");
    } else {
      setError("Incorrect password.");
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        autoFocus
        required
        style={{
          width: "100%", padding: "0.6rem 0.75rem", fontSize: "1rem",
          border: "1px solid #DDD3BA", borderRadius: 8, outline: "none",
          boxSizing: "border-box", marginBottom: "0.75rem",
        }}
      />
      {error && (
        <p style={{ margin: "0 0 0.75rem", fontSize: "0.85rem", color: "#c0392b" }}>
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy}
        style={{
          width: "100%", padding: "0.65rem", fontSize: "1rem",
          background: "#1B3A3A", color: "#F5E9C8", border: "none",
          borderRadius: 8, cursor: busy ? "not-allowed" : "pointer",
          opacity: busy ? 0.7 : 1,
        }}
      >
        {busy ? "Checking…" : "Enter"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center",
      justifyContent: "center", background: "#FDFAF3", fontFamily: "sans-serif",
    }}>
      <div style={{
        width: "100%", maxWidth: 360, padding: "2rem",
        background: "#fff", borderRadius: 12, border: "1px solid #E2DAC6",
        boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
      }}>
        <h1 style={{ margin: "0 0 0.25rem", fontSize: "1.4rem", color: "#1B3A3A" }}>
          Barakah Board
        </h1>
        <p style={{ margin: "0 0 1.5rem", fontSize: "0.85rem", color: "#7A7060" }}>
          Enter your password to continue
        </p>
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
