/* Firebase Cloud Messaging Service Worker */
importScripts("https://www.gstatic.com/firebasejs/11.6.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/11.6.0/firebase-messaging-compat.js");

// Config injected at build time via sw-env.js or loaded from meta
// This file must be at the origin root (/firebase-messaging-sw.js)
// Firebase SDK will register it automatically when getToken() is called

// eslint-disable-next-line no-undef
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "FIREBASE_CONFIG") {
    // eslint-disable-next-line no-undef
    firebase.initializeApp(event.data.config);
    // eslint-disable-next-line no-undef
    const messaging = firebase.messaging();

    messaging.onBackgroundMessage((payload) => {
      const title = payload.notification?.title ?? "Einsatzbericht";
      const body = payload.notification?.body ?? "";
      // eslint-disable-next-line no-undef
      self.registration.showNotification(title, {
        body,
        icon: "/icon-192.svg",
        badge: "/icon-192.svg"
      });
    });
  }
});
