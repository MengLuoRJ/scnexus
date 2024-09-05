import { init, setUser } from "@sentry/electron/main";
import { app } from "electron";

export function initSentry() {
  if (!app.isPackaged) return;
  init({ dsn: import.meta.env.VITE_SENTRY_DSN });
}

export function setSentryUser(user: {
  id?: string;
  username?: string;
  client_id?: string;
}) {
  // if any field in `user` not undefined, then set the whole user `setUser(user)`,
  // else all fields are undefined, then `setUser(null)`.
  if (user.id || user.username || user.client_id) {
    setUser(user);
  } else {
    setUser(null);
  }
}
