import { ApiError } from "../api/client";
import { login, register } from "../api/authApi";
import { setUser } from "../state/appState";
import { html, toElement, type SafeHtml } from "../utils/dom";
import { icon } from "./icons";

type AuthMode = "login" | "signup";

export interface OpenAuthOptions {
  mode?: AuthMode;
  onSuccess?: () => void;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];

let pendingAction: (() => void) | null = null;

export function openAuth({ mode = "login", onSuccess }: OpenAuthOptions = {}): void {
  if (onSuccess) pendingAction = onSuccess;

  const existing = document.querySelector<HTMLElement>(".auth");
  if (existing) {
    existing.dispatchEvent(new CustomEvent("auth-mode", { detail: mode }));
    return;
  }

  let currentMode: AuthMode = mode;
  const fields = { username: "", email: "", password: "", password_confirmation: "" };
  let errors: Record<string, string> = {};
  let formError = "";
  let submitting = false;
  let avatar: File | null = null;
  let avatarUrl: string | null = null;

  const overlay = toElement(html`<div class="auth"></div>`);
  document.body.append(overlay);

  const finish = (succeeded: boolean) => {
    const action = pendingAction;
    pendingAction = null;
    if (avatarUrl) URL.revokeObjectURL(avatarUrl);
    overlay.remove();
    document.removeEventListener("keydown", onKeydown);
    if (succeeded) action?.();
  };

  const onKeydown = (event: KeyboardEvent) => {
    if (event.key === "Escape") finish(false);
  };

  const validate = (): boolean => {
    errors = {};
    const email = fields.email.trim();
    const password = fields.password;

    if (!EMAIL_PATTERN.test(email)) errors.email = "Enter a valid email";
    if (password.length < 3) errors.password = "Password must be at least 3 characters";

    if (currentMode === "signup") {
      if (fields.username.trim().length < 3) errors.username = "Username must be at least 3 characters";
      if (fields.password_confirmation !== password) errors.password_confirmation = "Passwords do not match";
      if (avatar && !AVATAR_TYPES.includes(avatar.type)) errors.avatar = "Use a JPG, PNG or WebP image";
    }

    return Object.keys(errors).length === 0;
  };

  const isReady = (): boolean => {
    const email = fields.email.trim();
    const password = fields.password;
    if (!EMAIL_PATTERN.test(email) || password.length < 3) return false;
    if (currentMode === "signup") {
      if (fields.username.trim().length < 3) return false;
      if (fields.password_confirmation !== password) return false;
      if (avatar && !AVATAR_TYPES.includes(avatar.type)) return false;
    }
    return true;
  };

  function fieldMarkup(name: keyof typeof fields, label: string, type: string, placeholder: string): SafeHtml {
    const error = errors[name];
    return html`
      <label class="auth__field">
        <span class="auth__label text-label-s">${label}</span>
        <input name="${name}" type="${type}" value="${fields[name]}" placeholder="${placeholder}" autocomplete="off" />
        ${error && html`<span class="auth__error text-body-s">${error}</span>`}
      </label>
    `;
  }

  const render = () => {
    const loginMode = currentMode === "login";
    overlay.innerHTML = html`
      <div
        class="auth__dialog ${loginMode ? "auth__dialog--login" : "auth__dialog--signup"}"
        role="dialog"
        aria-modal="true"
        aria-label="${loginMode ? "Log in" : "Sign up"}"
      >
        <header class="auth__header">
          <div>
            <h2 class="text-h2">${loginMode ? "Log in" : "Sign up"}</h2>
            <p class="auth__subtitle text-body-s">${loginMode ? "Welcome back to Kino XII" : "Welcome to Kino XII"}</p>
          </div>
          <button class="auth__close" type="button" data-action="close" aria-label="Close">×</button>
        </header>
        <div class="auth__body">
          <form class="auth__form" novalidate>
            ${formError && html`<p class="auth__form-error text-body-s">${formError}</p>`}
            ${loginMode
              ? html`
                  ${fieldMarkup("email", "Email", "email", "example@gmail.com")}
                  ${fieldMarkup("password", "Password", "password", "••••••••")}
                `
              : html`
                  <label class="auth__avatar">
                    <span class="auth__avatar-preview">
                      ${avatarUrl ? html`<img src="${avatarUrl}" alt="" />` : icon("upload")}
                    </span>
                    <span class="auth__avatar-copy">
                      <span class="text-label-m">Upload avatar (optional)</span>
                      <span class="text-body-s text-secondary">JPG, PNG or WEBP</span>
                      ${errors.avatar && html`<span class="auth__error text-body-s">${errors.avatar}</span>`}
                    </span>
                    <input name="avatar" type="file" accept="image/jpeg,image/png,image/webp" />
                  </label>
                  ${fieldMarkup("username", "Username", "text", "User")}
                  ${fieldMarkup("email", "Email", "email", "example@gmail.com")}
                  <div class="auth__row">
                    ${fieldMarkup("password", "Password", "password", "••••••••")}
                    ${fieldMarkup("password_confirmation", "Confirm password", "password", "••••••••")}
                  </div>
                `}
            <button class="button button--primary auth__submit" type="submit" ${(!isReady() || submitting) && "disabled"}>
              ${submitting ? "Please wait…" : loginMode ? "Log in" : "Sign up"}
            </button>
          </form>
          <p class="auth__switch text-body-s">
            ${loginMode
              ? html`Don't have an account? <button type="button" data-action="switch">Sign up</button>`
              : html`Already have an account? <button type="button" data-action="switch">Log in</button>`}
          </p>
        </div>
      </div>
    `.value;
  };

  overlay.addEventListener("auth-mode", (event) => {
    currentMode = (event as CustomEvent<AuthMode>).detail;
    errors = {};
    formError = "";
    render();
  });

  overlay.addEventListener("click", (event) => {
    const target = event.target as Element;
    if (target === overlay || target.closest("[data-action='close']")) {
      finish(false);
      return;
    }
    if (target.closest("[data-action='switch']")) {
      currentMode = currentMode === "login" ? "signup" : "login";
      errors = {};
      formError = "";
      render();
    }
  });

  overlay.addEventListener("input", (event) => {
    const input = event.target as HTMLInputElement;
    if (input.name in fields) fields[input.name as keyof typeof fields] = input.value;
    const submit = overlay.querySelector<HTMLButtonElement>(".auth__submit");
    if (submit) submit.disabled = !isReady() || submitting;
  });

  overlay.addEventListener("change", (event) => {
    const input = event.target as HTMLInputElement;
    if (input.name !== "avatar" || !input.files) return;
    avatar = input.files[0] ?? null;
    if (avatarUrl) URL.revokeObjectURL(avatarUrl);
    avatarUrl = avatar ? URL.createObjectURL(avatar) : null;
    errors.avatar = "";
    render();
  });

  overlay.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submitting) return;
    formError = "";
    if (!validate()) {
      render();
      return;
    }

    submitting = true;
    render();

    try {
      const email = fields.email.trim();
      const result =
        currentMode === "login"
          ? await login({ email, password: fields.password })
          : await register({
              username: fields.username.trim(),
              email,
              password: fields.password,
              password_confirmation: fields.password_confirmation,
              avatar: avatar ?? undefined,
            });
      setUser(result.user);
      submitting = false;
      finish(true);
    } catch (error) {
      submitting = false;
      if (error instanceof ApiError && error.isValidationError && error.errors) {
        errors = Object.fromEntries(Object.entries(error.errors).map(([key, messages]) => [key, messages[0] ?? "Invalid value"]));
      } else if (error instanceof ApiError) {
        formError = error.message;
      } else {
        formError = "Something went wrong. Please try again.";
      }
      render();
    }
  });

  document.addEventListener("keydown", onKeydown);
  render();
}
