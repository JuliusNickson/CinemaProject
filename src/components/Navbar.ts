import { getCurrentPath, onRouteChange } from "../router/router";
import { appState } from "../state/appState";
import type { User } from "../types/auth";
import { html, toElement, type SafeHtml } from "../utils/dom";

export interface NavbarOptions {
  onLogIn?: () => void;
  onSignUp?: () => void;
  onLogOut?: () => void;
}

const NAV_LINKS = [
  { href: "/", label: "Home", isActive: (path: string) => path === "/" },
  { href: "/sessions", label: "Sessions", isActive: (path: string) => path.startsWith("/sessions") },
];

function avatarMarkup(user: User): SafeHtml {
  if (user.avatar) {
    return html`<img class="navbar__avatar" src="${user.avatar}" alt="" />`;
  }
  return html`<span class="navbar__avatar navbar__avatar--initial">${user.username.charAt(0).toUpperCase()}</span>`;
}

function userMarkup(user: User): SafeHtml {
  const statusLabel = user.profileComplete ? "Profile complete" : "Please complete your profile to enable booking.";
  const statusModifier = user.profileComplete ? "complete" : "incomplete";

  return html`
    <a class="navbar__profile" href="/profile" title="${statusLabel}">
      <span class="navbar__avatar-wrap">
        ${avatarMarkup(user)}
        <span class="navbar__status navbar__status--${statusModifier}" aria-label="${statusLabel}"></span>
      </span>
      <span class="navbar__username">${user.username}</span>
    </a>
    <button class="button button--ghost" type="button" data-action="log-out">Log Out</button>
  `;
}

function guestMarkup(): SafeHtml {
  return html`
    <button class="button button--ghost" type="button" data-action="log-in">Log In</button>
    <button class="button button--primary" type="button" data-action="sign-up">Sign Up</button>
  `;
}

function navbarMarkup(user: User | null, path: string): SafeHtml {
  return html`
    <div class="navbar__inner container">
      <a class="navbar__logo" href="/">KINO<span>XII</span></a>
      <nav class="navbar__links" aria-label="Main">
        ${NAV_LINKS.map(
          (link) => html`
            <a
              class="navbar__link ${link.isActive(path) && "navbar__link--active"}"
              href="${link.href}"
              ${link.isActive(path) && html`aria-current="page"`}
            >${link.label}</a>
          `,
        )}
      </nav>
      <div class="navbar__actions">${user ? userMarkup(user) : guestMarkup()}</div>
    </div>
  `;
}

export function Navbar(options: NavbarOptions = {}): HTMLElement {
  const header = toElement(html`<header class="navbar"></header>`);

  const render = () => {
    header.innerHTML = navbarMarkup(appState.get().user, getCurrentPath()).value;
  };

  header.addEventListener("click", (event) => {
    const action = (event.target as Element).closest<HTMLElement>("[data-action]")?.dataset.action;
    if (action === "log-in") options.onLogIn?.();
    else if (action === "sign-up") options.onSignUp?.();
    else if (action === "log-out") options.onLogOut?.();
  });

  appState.subscribe((state, previous) => {
    if (state.user !== previous.user) render();
  });
  onRouteChange(render);
  render();

  return header;
}
