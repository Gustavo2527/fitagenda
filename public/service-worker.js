// Service Worker for FitAgenda PWA
self.addEventListener("install", (e) => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(self.clients.claim());
});

// Handle incoming push messages (server-sent)
self.addEventListener("push", (event) => {
  let data = { title: "FitAgenda", body: "Nova notificação" };
  try {
    data = event.data?.json() || data;
  } catch {
    // fallback
  }

  const options = {
    body: data.body,
    icon: "/icon-192x192.png",
    tag: data.data?.tag || "fitagenda-push",
    data: data.data || {},
  };

  // If it's a completion notification, add actions (non-iOS)
  if (data.data?.type === "completion") {
    options.actions = [
      { action: "sim", title: "✅ Sim" },
      { action: "nao", title: "❌ Não" },
    ];
    options.requireInteraction = true;
  }

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener("notificationclick", (event) => {
  const { action, data } = event.notification;
  event.notification.close();

  if (data && data.type === "completion") {
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
