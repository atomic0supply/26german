import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import {
  connectAuthEmulator,
  getAuth,
  setPersistence,
  browserLocalPersistence
} from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";
import { connectStorageEmulator, getStorage } from "firebase/storage";
import { getMessaging, isSupported as isMessagingSupported } from "firebase/messaging";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch(() => undefined);

export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, "europe-west3");

export let messaging: ReturnType<typeof getMessaging> | null = null;
if (typeof window !== "undefined") {
  void isMessagingSupported().then((supported) => {
    if (supported) {
      messaging = getMessaging(app);
      // Forward Firebase config to the service worker for background messages
      navigator.serviceWorker?.ready.then((registration) => {
        registration.active?.postMessage({ type: "FIREBASE_CONFIG", config: firebaseConfig });
      }).catch(() => undefined);
    }
  }).catch(() => undefined);
}

if (typeof window !== "undefined") {
  void isSupported()
    .then((supported) => {
      if (supported && import.meta.env.VITE_FIREBASE_MEASUREMENT_ID) {
        getAnalytics(app);
      }
    })
    .catch(() => undefined);
}

const useEmulators = import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS === "true";

const hasRequiredConfig = [
  firebaseConfig.apiKey,
  firebaseConfig.authDomain,
  firebaseConfig.projectId,
  firebaseConfig.appId
].every((value) => Boolean(value));

export const firebaseConnectionInfo = {
  projectId: firebaseConfig.projectId ?? "",
  authDomain: firebaseConfig.authDomain ?? "",
  usingEmulators: useEmulators,
  hasRequiredConfig
};

if (useEmulators) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectStorageEmulator(storage, "127.0.0.1", 9199);
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
}
