// Service Worker for FitAgenda PWA
self.addEventListener("install", (e) => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener("notificationclick", (event) => {
  const { action, data } = event.notification;
  event.notification.close();

  if (data && data.type === "completion") {
    // Non-iOS: action buttons
    const status = action === "sim" ? "completed" : action === "nao" ? "no_show" : null;
    if (status) {
      event.waitUntil(
        self.clients.matchAll({ type: "window" }).then((clients) => {
          clients.forEach((client) => {
            client.postMessage({
              type: "UPDATE_SESSION_STATUS",
              sessionId: data.sessionId,
              status,
            });
          });
          if (clients.length > 0) {
            clients[0].focus();
          }
        })
      );
    }
  } else if (data && data.type === "completion_ios") {
    // iOS: open app and show in-app modal
    event.waitUntil(
      self.clients.matchAll({ type: "window" }).then((clients) => {
        if (clients.length > 0) {
          clients[0].postMessage({
            type: "OPEN_COMPLETION_MODAL",
            sessionId: data.sessionId,
            clientName: data.clientName,
          });
          clients[0].focus();
        } else {
          self.clients.openWindow("/calendar");
        }
      })
    );
  } else {
    event.waitUntil(
      self.clients.matchAll({ type: "window" }).then((clients) => {
        if (clients.length > 0) {
          clients[0].focus();
        } else {
          self.clients.openWindow("/calendar");
        }
      })
    );
  }
});
