"use client";

import React, { useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  setPersistence,
  browserLocalPersistence,
} from "firebase/auth";
import { auth } from "../lib/firebaseClient";

/* ============================================================
   AUTH GATE — replaces the old SITE_PASSWORD cookie middleware
   ------------------------------------------------------------
   Firebase Email/Password sign-in. The page shell is public but
   holds no data; the actual protection is firestore.rules, which
   only answers to the owner's address. Sign-in persists in local
   storage so the PWA doesn't ask again on every launch.
   ============================================================ */

const S = {
  wrap: {
    minHeight: "100vh", display: "flex", alignItems: "center",
    justifyContent: "center", background: "#FDFAF3", fontFamily: "sans-serif",
    padding: "1rem",
  },
  card: {
    width: "100%", maxWidth: 360, padding: "2rem",
    background: "#fff", borderRadius: 12, border: "1px solid #E2DAC6",
    boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
  },
  input: {
    width: "100%", padding: "0.6rem 0.75rem", fontSize: "1rem",
    border: "1px solid #DDD3BA", borderRadius: 8, outline: "none",
    boxSizing: "border-box", marginBottom: "0.75rem",
  },
  button: {
    width: "100%", padding: "0.65rem", fontSize: "1rem",
    background: "#1B3A3A", color: "#F5E9C8", border: "none",
    borderRadius: 8,
  },
  err: { margin: "0 0 0.75rem", fontSize: "0.85rem", color: "#c0392b" },
};

// Firebase error codes are not user-facing text. Map the ones a legitimate
// owner can actually hit; everything else falls through to a generic line so
// we never leak whether an address exists.
function friendlyError(code) {
  switch (code) {
    case "auth/invalid-email":
      return "That doesn't look like a valid email address.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Email or password is incorrect.";
    case "auth/too-many-requests":
      return "Too many attempts. Wait a minute and try again.";
    case "auth/network-request-failed":
      return "Network problem — check your connection and try again.";
    default:
      return "Sign-in failed. Try again.";
  }
}

function SignInForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await setPersistence(auth, browserLocalPersistence);
      await signInWithEmailAndPassword(auth, email.trim(), password);
      // onAuthStateChanged in AuthGate swaps the board in — nothing to do here.
    } catch (err) {
      setError(friendlyError(err.code));
      setBusy(false);
    }
  }

  return (
    <div style={S.wrap}>
      <div style={S.card}>
        <h1 style={{ margin: "0 0 0.25rem", fontSize: "1.4rem", color: "#1B3A3A" }}>
          Barakah Board
        </h1>
        <p style={{ margin: "0 0 1.5rem", fontSize: "0.85rem", color: "#7A7060" }}>
          Sign in to continue
        </p>
        <form onSubmit={handleSubmit}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            autoComplete="username"
            autoFocus
            required
            style={S.input}
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoComplete="current-password"
            required
            style={S.input}
          />
          {error && <p style={S.err}>{error}</p>}
          <button
            type="submit"
            disabled={busy}
            style={{ ...S.button, cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.7 : 1 }}
          >
            {busy ? "Signing in…" : "Enter"}
          </button>
        </form>
      </div>
    </div>
  );
}

function Splash({ children }) {
  return (
    <div style={S.wrap}>
      <p style={{ fontSize: "0.9rem", color: "#7A7060" }}>{children}</p>
    </div>
  );
}

export default function AuthGate({ children }) {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!auth) { setChecking(false); return; }
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setChecking(false);
    });
  }, []);

  // Firebase not configured — fall through to the board's own demo mode so the
  // build never hard-fails on a missing env var.
  if (!auth) return children;

  if (checking) return <Splash>Loading…</Splash>;
  if (!user) return <SignInForm />;

  return (
    <>
      {children}
      <button
        onClick={() => signOut(auth)}
        style={{
          position: "fixed", bottom: 12, right: 12, zIndex: 50,
          padding: "0.35rem 0.7rem", fontSize: "0.7rem",
          background: "#fff", color: "#7A7060",
          border: "1px solid #E2DAC6", borderRadius: 999,
          cursor: "pointer", boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
        }}
      >
        Sign out
      </button>
    </>
  );
}
