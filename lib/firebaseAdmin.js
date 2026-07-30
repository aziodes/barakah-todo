import { initializeApp, getApps, getApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

// FIREBASE_SERVICE_ACCOUNT holds the full service-account JSON as a single-line
// string. Vercel env vars can't hold real newlines, so the private_key inside it
// arrives with literal "\n" sequences that must be turned back into newlines
// before the crypto layer will accept the key.
function loadCredential() {
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT || "").trim();
  if (!raw) return null;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    console.error("FIREBASE_SERVICE_ACCOUNT is not valid JSON:", e.message);
    return null;
  }

  if (parsed.private_key) {
    parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
  }
  return parsed;
}

let app = null;
const serviceAccount = loadCredential();
if (serviceAccount) {
  try {
    app = getApps().length
      ? getApp()
      : initializeApp({
          credential: cert(serviceAccount),
          projectId: serviceAccount.project_id,
        });
  } catch (e) {
    console.error("Firebase Admin failed to initialize:", e.message);
  }
}

export const adminApp = app;
export const adminDb = app ? getFirestore(app) : null;
export const adminAuth = app ? getAuth(app) : null;
export const TASKS_COLLECTION = "barakah_tasks";

// Verifies a "Authorization: Bearer <idToken>" header and returns the decoded
// token, or null when absent/invalid. Used to gate the paid /api/extract route
// so only the signed-in owner can spend Anthropic credits.
export async function verifyRequest(req) {
  if (!adminAuth) return null;
  const header = req.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  try {
    return await adminAuth.verifyIdToken(match[1]);
  } catch {
    return null;
  }
}

// Single-owner app: only this address may read or write tasks. Mirrors the
// condition in firestore.rules so client and server agree.
export function isOwner(decoded) {
  const owner = (process.env.BARAKAH_OWNER_EMAIL || "").trim().toLowerCase();
  if (!owner || !decoded?.email) return false;
  return decoded.email.toLowerCase() === owner;
}
