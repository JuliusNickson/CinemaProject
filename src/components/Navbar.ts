import { getCurrentPath, onRouteChange } from "../router/router";
import { appState } from "../state/appState";
import type { User } from "../types/auth";
import { html, raw, toElement, type SafeHtml } from "../utils/dom";

export interface NavbarOptions {
  onLogIn?: () => void;
  onSignUp?: () => void;
  onLogOut?: () => void;
  onSearch?: (query: string) => void;
}

const SEARCH_ICON = raw(`
  <svg class="navbar__search-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="7" cy="7" r="5.25" stroke="currentColor" stroke-width="1.5" />
    <path d="M11 11l3.25 3.25" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
  </svg>
`);

const CHEVRON_ICON = raw(`
  <svg class="navbar__chevron" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
`);

function displayName(user: User): string {
  return user.fullName?.trim().split(/\s+/)[0] || user.username;
}

function initials(user: User): string {
  const words = user.fullName?.trim().split(/\s+/).filter(Boolean) ?? [];
  const letters = words.length > 0 ? words.slice(0, 2).map((word) => word[0]).join("") : user.username.slice(0, 2);
  return letters.toUpperCase();
}

function avatarMarkup(user: User): SafeHtml {
  const status = user.profileComplete
    ? { modifier: "complete", label: "Profile complete" }
    : { modifier: "incomplete", label: "Profile incomplete" };

  return html`
    <span class="navbar__avatar">
      ${user.avatar
        ? html`<img class="navbar__avatar-image" src="${user.avatar}" alt="" />`
        : html`<span class="navbar__avatar-initials text-label-s">${initials(user)}</span>`}
      <span class="navbar__status navbar__status--${status.modifier}" title="${status.label}"></span>
    </span>
  `;
}

function userMarkup(user: User): SafeHtml {
  return html`
    <div class="navbar__user">
      <button
        class="navbar__profile-toggle"
        type="button"
        data-action="toggle-menu"
        aria-haspopup="menu"
        aria-expanded="false"
        aria-controls="navbar-menu"
      >
        ${avatarMarkup(user)}
        <span class="navbar__name text-label-m">${displayName(user)}</span>
        ${CHEVRON_ICON}
      </button>
      <div class="navbar__menu" id="navbar-menu" role="menu" hidden>
        <a class="navbar__menu-item text-label-m" role="menuitem" href="/profile">Profile</a>
        <a class="navbar__menu-item text-label-m" role="menuitem" href="/profile?tab=tickets">My Tickets</a>
        <button class="navbar__menu-item text-label-m" role="menuitem" type="button" data-action="log-out">
          Log out
        </button>
      </div>
    </div>
  `;
}

function guestMarkup(): SafeHtml {
  return html`
    <button class="button button--primary" type="button" data-action="sign-up">Sign up</button>
    <button class="button button--light" type="button" data-action="log-in">Log in</button>
  `;
}

function navbarMarkup(user: User | null, path: string): SafeHtml {
  const sessionsActive = path.startsWith("/sessions");

  return html`
    <div class="navbar__inner">
      <nav class="navbar__left" aria-label="Main">
        <a class="navbar__logo" href="/" aria-label="Kino XII home">KINO <span>XII</span></a>
        <a
          class="navbar__link text-overline ${sessionsActive && "navbar__link--active"}"
          href="/sessions"
          ${sessionsActive && html`aria-current="page"`}
        >Sessions</a>
      </nav>
      <div class="navbar__right">
        <form class="navbar__search" role="search">
          ${SEARCH_ICON}
          <input
            class="navbar__search-input text-body-m"
            type="search"
            name="q"
            placeholder="Search films and live events"
            aria-label="Search films and live events"
            autocomplete="off"
          />
        </form>
        ${user ? userMarkup(user) : guestMarkup()}
      </div>
    </div>
  `;
}

export function Navbar(options: NavbarOptions = {}): HTMLElement {
  const header = toElement(html`<header class="navbar"></header>`);

  const setMenuOpen = (open: boolean) => {
    const toggle = header.querySelector<HTMLButtonElement>("[data-action='toggle-menu']");
    const menu = header.querySelector<HTMLElement>(".navbar__menu");
    if (!toggle || !menu) return;

    toggle.setAttribute("aria-expanded", String(open));
    menu.hidden = !open;
  };

  const isMenuOpen = () => header.querySelector(".navbar__menu:not([hidden])") !== null;

  const render = () => {
    header.innerHTML = navbarMarkup(appState.get().user, getCurrentPath()).value;
  };

  header.addEventListener("click", (event) => {
    const target = event.target as Element;
    const action = target.closest<HTMLElement>("[data-action]")?.dataset.action;

    if (action === "toggle-menu") setMenuOpen(!isMenuOpen());
    else if (action === "log-in") options.onLogIn?.();
    else if (action === "sign-up") options.onSignUp?.();
    else if (action === "log-out") {
      setMenuOpen(false);
      options.onLogOut?.();
    } else if (target.closest(".navbar__menu-item")) setMenuOpen(false);
  });

  header.addEventListener("submit", (event) => {
    event.preventDefault();
    const input = header.querySelector<HTMLInputElement>(".navbar__search-input");
    const query = input?.value.trim();
    if (query) options.onSearch?.(query);
  });

  document.addEventListener("click", (event) => {
    if (isMenuOpen() && !(event.target as Element).closest(".navbar__user")) setMenuOpen(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !isMenuOpen()) return;
    setMenuOpen(false);
    header.querySelector<HTMLButtonElement>("[data-action='toggle-menu']")?.focus();
  });

  const updateActiveLink = (path: string) => {
    const link = header.querySelector<HTMLAnchorElement>(".navbar__link");
    if (!link) return;

    const active = path.startsWith("/sessions");
    link.classList.toggle("navbar__link--active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  };

  appState.subscribe((state, previous) => {
    if (state.user !== previous.user) render();
  });
  onRouteChange((path) => {
    updateActiveLink(path);
    setMenuOpen(false);
  });
  render();

  return header;
}
