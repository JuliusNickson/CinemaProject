import { getCurrentPath, onRouteChange } from "../router/router";
import { appState } from "../state/appState";
import type { User } from "../types/auth";
import { html, toElement, type SafeHtml } from "../utils/dom";
import { icon } from "./icons";

export interface NavbarOptions {
  onLogIn?: () => void;
  onSignUp?: () => void;
  onLogOut?: () => void;
  onSearch?: (query: string) => void;
}

function firstName(user: User): string {
  return user.fullName?.trim().split(/\s+/)[0] || user.username;
}

function fullName(user: User): string {
  return user.fullName?.trim() || user.username;
}

function initials(user: User): string {
  const words = user.fullName?.trim().split(/\s+/).filter(Boolean) ?? [];
  const letters = words.length > 0 ? words.slice(0, 2).map((word) => word[0]).join("") : user.username.slice(0, 2);
  return letters.toUpperCase();
}

function avatarMarkup(user: User, size: "md" | "lg"): SafeHtml {
  const status = user.profileComplete ? "complete" : "incomplete";

  return html`
    <span class="avatar avatar--${size}">
      ${user.avatar
        ? html`<img class="avatar__image" src="${user.avatar}" alt="" />`
        : html`<span class="avatar__initials text-label-s">${initials(user)}</span>`}
      <span class="avatar__status avatar__status--${status}"></span>
    </span>
  `;
}

function profileStatusMarkup(user: User): SafeHtml {
  if (user.profileComplete) {
    return html`
      <div class="profile-menu__status profile-menu__status--complete">
        <span class="text-label-m">Profile Complete</span>
        ${icon("check")}
      </div>
    `;
  }

  return html`
    <div class="profile-menu__status profile-menu__status--incomplete">
      <span class="text-label-m">Profile incomplete</span>
      <span class="text-body-s text-secondary">Please complete your profile to enable booking</span>
    </div>
  `;
}

function profileMenuMarkup(user: User): SafeHtml {
  return html`
    <div class="profile-menu" id="profile-menu" hidden>
      <div class="profile-menu__header">
        <div class="profile-menu__identity">
          ${avatarMarkup(user, "lg")}
          <div class="profile-menu__identity-text">
            <span class="text-label-m">${fullName(user)}</span>
            <span class="text-body-s text-secondary">${user.email}</span>
          </div>
        </div>
        ${profileStatusMarkup(user)}
      </div>
      <nav class="profile-menu__actions" aria-label="Account">
        <div class="profile-menu__list">
          <a class="profile-menu__item text-label-m" href="/profile">${icon("user")}My Profile</a>
          <a class="profile-menu__item text-label-m" href="/profile?tab=tickets">${icon("ticket")}My Tickets</a>
        </div>
        <hr class="profile-menu__divider" />
        <button class="profile-menu__item profile-menu__item--danger text-label-m" type="button" data-action="log-out">
          ${icon("logout")}Log out
        </button>
      </nav>
    </div>
  `;
}

function userMarkup(user: User): SafeHtml {
  return html`
    <div class="navbar__user">
      <button
        class="navbar__profile-toggle"
        type="button"
        data-action="toggle-menu"
        aria-expanded="false"
        aria-controls="profile-menu"
        aria-label="Account menu"
      >
        <span class="navbar__profile">
          ${avatarMarkup(user, "md")}
          <span class="navbar__name text-label-m">${firstName(user)}</span>
        </span>
        ${icon("chevron-down", "navbar__chevron")}
      </button>
      ${profileMenuMarkup(user)}
    </div>
  `;
}

function guestMarkup(): SafeHtml {
  return html`
    <div class="navbar__auth">
      <button class="button button--primary" type="button" data-action="sign-up">Sign up</button>
      <button class="button button--light" type="button" data-action="log-in">Log in</button>
    </div>
  `;
}

function navbarMarkup(user: User | null, path: string): SafeHtml {
  const sessionsActive = path.startsWith("/sessions");

  return html`
    <div class="navbar__inner">
      <nav class="navbar__left" aria-label="Main">
        <a class="navbar__logo text-h2" href="/" aria-label="Kino XII home">
          <span>KINO</span><span class="navbar__logo-accent">XII</span>
        </a>
        <a
          class="navbar__link text-overline ${sessionsActive && "navbar__link--active"}"
          href="/sessions"
          ${sessionsActive && html`aria-current="page"`}
        >Sessions</a>
      </nav>
      <div class="navbar__right">
        <form class="navbar__search" role="search">
          ${icon("search", "navbar__search-icon")}
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
    <div class="navbar__scrim" hidden></div>
  `;
}

export function Navbar(options: NavbarOptions = {}): HTMLElement {
  const header = toElement(html`<header class="navbar"></header>`);

  const getToggle = () => header.querySelector<HTMLButtonElement>("[data-action='toggle-menu']");
  const isMenuOpen = () => getToggle()?.getAttribute("aria-expanded") === "true";

  const setMenuOpen = (open: boolean) => {
    const toggle = getToggle();
    const menu = header.querySelector<HTMLElement>(".profile-menu");
    const scrim = header.querySelector<HTMLElement>(".navbar__scrim");
    if (!toggle || !menu || !scrim) return;

    toggle.setAttribute("aria-expanded", String(open));
    menu.hidden = !open;
    scrim.hidden = !open;
  };

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
    } else if (target.closest(".profile-menu__item")) setMenuOpen(false);
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
    getToggle()?.focus();
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
