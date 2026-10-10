import "./styles/main.css";

import { logout } from "./api/authApi";
import { onUnauthorized } from "./api/client";
import { openAuth } from "./components/AuthModal";
import { Footer } from "./components/Footer";
import { Navbar } from "./components/Navbar";
import { HomePage } from "./pages/HomePage";
import { MovieDetailsPage } from "./pages/MovieDetailsPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { ProfilePage } from "./pages/ProfilePage";
import { SessionsPage } from "./pages/SessionsPage";
import { startRouter } from "./router/router";
import { bootstrap, setUser } from "./state/appState";
import { setAuthPrompt } from "./state/requireAuth";
import { html, toElement } from "./utils/dom";

async function handleLogOut(): Promise<void> {
  try {
    await logout();
  } catch (error) {
    console.error("Logout request failed", error);
  } finally {
    setUser(null);
  }
}

async function start(): Promise<void> {
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("#app element is missing from index.html");

  root.replaceChildren(toElement(html`<div class="app-loading" role="status">Loading…</div>`));
  await bootstrap();

  const outlet = toElement(html`<main class="app-main"></main>`);
  setAuthPrompt((action) => openAuth({ mode: "login", onSuccess: action }));
  onUnauthorized(() => {
    setUser(null);
    openAuth({ mode: "login" });
  });

  root.replaceChildren(
    Navbar({
      onLogIn: () => openAuth({ mode: "login" }),
      onSignUp: () => openAuth({ mode: "signup" }),
      onLogOut: handleLogOut,
    }),
    outlet,
    Footer(),
  );

  startRouter({
    outlet,
    notFound: NotFoundPage,
    routes: [
      { path: "/", page: HomePage },
      { path: "/sessions", page: SessionsPage },
      { path: "/movies/:slug", page: MovieDetailsPage },
      { path: "/profile", page: ProfilePage },
    ],
  });
}

start();
