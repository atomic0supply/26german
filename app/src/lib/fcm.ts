import { getToken, onMessage } from "firebase/messaging";
import { httpsCallable } from "firebase/functions";
import { messaging, functions } from "../firebase";

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;
const SESSION_KEY = "fcm_token_saved";

export const requestPushPermissionAndSaveToken = async (uid: string): Promise<boolean> => {
  if (!messaging || !VAPID_KEY) {
    return false;
  }
  // Only request once per session
  if (sessionStorage.getItem(SESSION_KEY) === uid) {
    return true;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return false;
    }

    const token = await getToken(messaging, { vapidKey: VAPID_KEY });
    if (!token) {
      return false;
    }

    const saveFcmToken = httpsCallable(functions, "saveFcmToken");
    await saveFcmToken({ token });
    sessionStorage.setItem(SESSION_KEY, uid);
    return true;
  } catch {
    return false;
  }
};

export const onForegroundMessage = (callback: (title: string, body: string) => void) => {
  if (!messaging) {
    return () => undefined;
  }
  return onMessage(messaging, (payload) => {
    const title = payload.notification?.title ?? "Einsatzbericht";
    const body = payload.notification?.body ?? "";
    callback(title, body);
  });
};
