export interface RouteContext {
  path: string;
  params: Record<string, string>;
  query: URLSearchParams;
  /** Aborted when the user navigates away; use it for fetches and subscriptions. */
  signal: AbortSignal;
}

export type Page = (context: RouteContext) => HTMLElement;

export interface Route {
  path: string;
  page: Page;
}

interface CompiledRoute {
  pattern: RegExp;
  paramNames: string[];
  page: Page;
}

type RouteListener = (path: string) => void;

let compiledRoutes: CompiledRoute[] = [];
let notFoundPage: Page | null = null;
let outlet: HTMLElement | null = null;
let currentController: AbortController | null = null;
let currentPath = "";
const listeners = new Set<RouteListener>();

/** `/movies/:slug` → a regex capturing `slug`. */
function compile(route: Route): CompiledRoute {
  const paramNames: string[] = [];
  const source = route.path
    .split("/")
    .map((segment) => {
      if (!segment.startsWith(":")) return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      paramNames.push(segment.slice(1));
      return "([^/]+)";
    })
    .join("/");

  return { pattern: new RegExp(`^${source}/?$`), paramNames, page: route.page };
}

function match(path: string): { page: Page; params: Record<string, string> } | null {
  for (const route of compiledRoutes) {
    const result = route.pattern.exec(path);
    if (!result) continue;

    const params: Record<string, string> = {};
    route.paramNames.forEach((name, index) => {
      params[name] = decodeURIComponent(result[index + 1]);
    });
    return { page: route.page, params };
  }
  return null;
}

function render(): void {
  if (!outlet) return;

  currentController?.abort();
  currentController = new AbortController();

  const url = new URL(window.location.href);
  currentPath = url.pathname;

  const matched = match(url.pathname);
  const page = matched?.page ?? notFoundPage;
  if (!page) return;

  const context: RouteContext = {
    path: url.pathname,
    params: matched?.params ?? {},
    query: url.searchParams,
    signal: currentController.signal,
  };

  try {
    outlet.replaceChildren(page(context));
  } catch (error) {
    console.error(error);
    const message = document.createElement("p");
    message.className = "page-error";
    message.textContent = "Something went wrong while loading this page.";
    outlet.replaceChildren(message);
  }

  listeners.forEach((listener) => listener(currentPath));
}

export function navigate(to: string, options: { replace?: boolean } = {}): void {
  const target = new URL(to, window.location.origin);
  const pathChanged = target.pathname !== window.location.pathname;
  const href = `${target.pathname}${target.search}${target.hash}`;

  if (options.replace) window.history.replaceState(null, "", href);
  else window.history.pushState(null, "", href);

  render();
  if (pathChanged) window.scrollTo(0, 0);
}

export function getCurrentPath(): string {
  return currentPath;
}

/** Called after every render with the new path. Returns an unsubscribe function. */
export function onRouteChange(listener: RouteListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function handleLinkClick(event: MouseEvent): void {
  if (event.defaultPrevented || event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

  const link = (event.target as Element | null)?.closest("a");
  if (!link || !link.href || link.target === "_blank" || link.hasAttribute("download")) return;

  const url = new URL(link.href);
  if (url.origin !== window.location.origin) return;

  event.preventDefault();
  navigate(`${url.pathname}${url.search}${url.hash}`);
}

export function startRouter(options: { routes: Route[]; outlet: HTMLElement; notFound: Page }): void {
  compiledRoutes = options.routes.map(compile);
  notFoundPage = options.notFound;
  outlet = options.outlet;

  document.addEventListener("click", handleLinkClick);
  window.addEventListener("popstate", render);
  render();
}
