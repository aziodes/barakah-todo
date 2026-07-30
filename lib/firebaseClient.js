import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Strip accidental surrounding quotes or whitespace from copy-paste
const sanitize = (v) => (v || "").trim().replace(/^["']|["']$/g, "");

const config = {
  apiKey: sanitize(process.env.NEXT_PUBLIC_FIREBASE_API_KEY),
  authDomain: sanitize(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN),
  projectId: sanitize(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
  storageBucket: sanitize(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET),
  messagingSenderId: sanitize(process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID),
  appId: sanitize(process.env.NEXT_PUBLIC_FIREBASE_APP_ID),
};

// These values are safe to expose publicly — Firebase web config is not a
// secret. Access control lives in firestore.rules, which restricts reads and
// writes to the owner's signed-in email address.
//
// If env vars are missing OR malformed, `firebaseApp` becomes null and the app
// falls back to local demo mode instead of crashing the build. Check the Vercel
// build/function logs for the warning below if sync isn't working.
let app = null;
if (config.apiKey && config.projectId && config.appId) {
  try {
    app = getApps().length ? getApp() : initializeApp(config);
  } catch (e) {
    console.error(
      "Firebase client failed to initialize — check NEXT_PUBLIC_FIREBASE_* env vars in Vercel:",
      e.message
    );
  }
}

export const firebaseApp = app;
export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;
export const TASKS_COLLECTION = "barakah_tasks";
