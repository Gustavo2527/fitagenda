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
    const status = action === "yes" ? "completed" : action === "no" ? "no_show" : null;
    if (status) {
      // Send message to all clients to update session status
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
  } else {
    // For reminder notifications, just focus the app
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
