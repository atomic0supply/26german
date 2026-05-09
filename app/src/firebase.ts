import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import {
  connectAuthEmulator,
  getAuth,
  setPersistence,
  browserLocalPersistence
} from "firebase/auth";
import { connectFirestoreEmulator, initializeFirestore } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";
import { connectStorageEmulator, getStorage } from "firebase/storage";

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
const useEmulators = import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS === "true";
const isSafariBrowser = typeof navigator !== "undefined"
  && /safari/i.test(navigator.userAgent)
  && !/chrome|chromium|android/i.test(navigator.userAgent);

export const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch(() => undefined);

export const db = initializeFirestore(app, isSafariBrowser
  ? { experimentalForceLongPolling: true }
  : { experimentalAutoDetectLongPolling: true });
export const storage = getStorage(app);
export const functions = getFunctions(app, "europe-west3");

if (typeof window !== "undefined") {
  void isSupported()
    .then((supported) => {
      if (supported && import.meta.env.VITE_FIREBASE_MEASUREMENT_ID) {
        getAnalytics(app);
      }
    })
    .catch(() => undefined);
}

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
