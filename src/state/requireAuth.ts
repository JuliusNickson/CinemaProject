import { isLoggedIn } from "./appState";

/** Opens the login flow and calls `onAuthenticated` once the user has signed in. */
type AuthPrompt = (onAuthenticated: () => void) => void;

let authPrompt: AuthPrompt | null = null;

export function setAuthPrompt(prompt: AuthPrompt | null): void {
  authPrompt = prompt;
}

/** Runs `action` now for signed-in users, otherwise after they log in. */
export function requireAuth(action: () => void): void {
  if (isLoggedIn()) action();
  else authPrompt?.(action);
}
