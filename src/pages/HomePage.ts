import { getComingSoon, getFeatured, getNowPlaying, notifyMe } from "../api/moviesApi";
import { HeroCarousel } from "../components/HeroCarousel";
import { icon } from "../components/icons";
import { MovieCardLarge, MovieCardMedium, MovieCardSmall, NotifyButton } from "../components/MovieCard";
import { ScrollRow, watchScrollRow } from "../components/ScrollRow";
import type { Page } from "../router/router";
import { appState } from "../state/appState";
import { requireAuth } from "../state/requireAuth";
import type { Movie } from "../types/movie";
import { html, toElement, type SafeHtml } from "../utils/dom";
import { getRecentlyViewed } from "../utils/recentlyViewed";

const NOW_PLAYING_LIMIT = 10;

/** Slugs the signed-in user subscribed to during this visit, keyed by user id. */
const notifiedByUser = new Map<number, Set<string>>();

function notifiedSlugs(): Set<string> {
  const user = appState.get().user;
  if (!user) return new Set();

  let slugs = notifiedByUser.get(user.id);
  if (!slugs) {
    slugs = new Set();
    notifiedByUser.set(user.id, slugs);
  }
  return slugs;
}

interface SlotOptions<T> {
  slot: HTMLElement;
  signal: AbortSignal;
  skeleton: SafeHtml;
  errorMessage: string;
  load: () => Promise<T>;
  render: (data: T) => void;
  renderError?: (content: SafeHtml) => SafeHtml;
}

function fillSlot<T>({ slot, signal, skeleton, errorMessage, load, render, renderError }: SlotOptions<T>): void {
  const run = async () => {
    slot.innerHTML = skeleton.value;

    try {
      const data = await load();
      if (!signal.aborted) render(data);
    } catch (error) {
      if (signal.aborted) return;
      console.error(errorMessage, error);

      const content = html`
        <div class="home-section__message" role="alert">
          <p>${errorMessage}</p>
          <button class="button button--tint" type="button" data-action="retry">Try again</button>
        </div>
      `;
      slot.innerHTML = (renderError ? renderError(content) : content).value;
      slot.querySelector("[data-action='retry']")?.addEventListener("click", run, { once: true, signal });
    }
  };

  void run();
}

function sectionHeader(id: string, title: string, action?: SafeHtml): SafeHtml {
  return html`
    <div class="home-section__header">
      <h2 class="text-h1" id="${id}">${title}</h2>
      ${action}
    </div>
  `;
}

function skeletons(count: number, className: string): SafeHtml {
  return html`
    <div class="home-section__skeletons" aria-hidden="true">
      ${Array.from({ length: count }, () => html`<div class="${className} skeleton"></div>`)}
    </div>
  `;
}

function emptyMessage(text: string): SafeHtml {
  return html`<p class="home-section__message">${text}</p>`;
}

function recentlyViewedMarkup(): SafeHtml {
  const recent = getRecentlyViewed();
  if (recent.length === 0) return html``;

  return html`
    <section class="home-section home-section--recent" aria-labelledby="recent-title">
      ${sectionHeader("recent-title", "Recently viewed")}
      ${ScrollRow(recent.map(MovieCardSmall), "Recently viewed films")}
    </section>
    <hr class="home__divider" />
  `;
}

function homeMarkup(): SafeHtml {
  return html`
    <div class="home">
      <h1 class="visually-hidden">Kino XII</h1>
      <div data-slot="hero"></div>
      <div class="home__content">
        ${recentlyViewedMarkup()}
        <section class="home-section home-section--now-playing" aria-labelledby="now-playing-title">
          ${sectionHeader(
            "now-playing-title",
            "NOW PLAYING",
            html`<a class="home-section__link text-label-m" href="/sessions">See all</a>`,
          )}
          <div data-slot="now-playing"></div>
        </section>
        <hr class="home__divider" />
        <section class="home-section home-section--coming-soon" aria-labelledby="coming-soon-title">
          ${sectionHeader(
            "coming-soon-title",
            "COMING SOON...",
            html`
              <button
                class="home-section__link text-label-m"
                type="button"
                data-action="toggle-coming-soon"
                aria-expanded="false"
                hidden
              >See all</button>
            `,
          )}
          <div data-slot="coming-soon"></div>
        </section>
      </div>
    </div>
  `;
}

export const HomePage: Page = ({ signal }) => {
  document.title = "Kino XII";

  const page = toElement(homeMarkup());
  const slot = (name: string) => page.querySelector<HTMLElement>(`[data-slot='${name}']`)!;
  const heroSlot = slot("hero");
  const nowPlayingSlot = slot("now-playing");
  const comingSoonSlot = slot("coming-soon");
  const comingSoonSection = page.querySelector<HTMLElement>(".home-section--coming-soon")!;
  const comingSoonToggle = page.querySelector<HTMLButtonElement>("[data-action='toggle-coming-soon']")!;
  let comingSoon: Movie[] = [];

  const mountRow = (target: HTMLElement, markup: SafeHtml) => {
    target.innerHTML = markup.value;
    const row = target.querySelector<HTMLElement>(".scroll-row");
    if (row) watchScrollRow(row, signal);
  };

  const recentRow = page.querySelector<HTMLElement>(".home-section--recent .scroll-row");
  if (recentRow) watchScrollRow(recentRow, signal);

  fillSlot({
    slot: heroSlot,
    signal,
    skeleton: html`<section class="hero skeleton" aria-busy="true" aria-label="Featured films"></section>`,
    errorMessage: "Featured films could not be loaded.",
    load: () => getFeatured(signal),
    render: (movies) => {
      if (movies.length === 0) {
        heroSlot.replaceChildren();
        page.classList.add("home--no-hero");
        return;
      }
      heroSlot.replaceChildren(HeroCarousel({ movies, signal }));
    },
    renderError: (content) => html`<section class="hero"><div class="hero__message">${content}</div></section>`,
  });

  fillSlot({
    slot: nowPlayingSlot,
    signal,
    skeleton: skeletons(6, "card-large"),
    errorMessage: "Now playing films could not be loaded.",
    load: () => getNowPlaying(NOW_PLAYING_LIMIT, signal),
    render: (movies) =>
      mountRow(
        nowPlayingSlot,
        movies.length > 0
          ? ScrollRow(movies.map(MovieCardLarge), "Now playing films")
          : emptyMessage("No films are showing right now."),
      ),
  });

  const renderComingSoon = () => {
    const notified = notifiedSlugs();
    mountRow(
      comingSoonSlot,
      comingSoon.length > 0
        ? ScrollRow(
            comingSoon.map((movie) => MovieCardMedium(movie, { notified: notified.has(movie.slug) })),
            "Coming soon films",
          )
        : emptyMessage("No upcoming releases yet."),
    );
    comingSoonToggle.hidden = comingSoon.length === 0;
  };

  fillSlot({
    slot: comingSoonSlot,
    signal,
    skeleton: skeletons(4, "card-medium"),
    errorMessage: "Coming soon films could not be loaded.",
    load: () => getComingSoon(undefined, signal),
    render: (movies) => {
      comingSoon = movies;
      renderComingSoon();
    },
  });

  const notify = async (slug: string) => {
    const button = page.querySelector<HTMLButtonElement>(`[data-action='notify'][data-slug='${CSS.escape(slug)}']`);
    if (!button || button.disabled) return;

    button.disabled = true;
    button.setAttribute("aria-busy", "true");

    try {
      await notifyMe(slug);
      notifiedSlugs().add(slug);
      button.outerHTML = NotifyButton(slug, true).value;
    } catch (error) {
      console.error("Notify me failed", error);
      button.disabled = false;
      button.removeAttribute("aria-busy");
      button.innerHTML = html`${icon("bell")}Try again`.value;
    }
  };

  page.addEventListener(
    "click",
    (event) => {
      const target = event.target as Element;
      const notifyButton = target.closest<HTMLButtonElement>("[data-action='notify']");

      if (notifyButton?.dataset.slug) {
        const { slug } = notifyButton.dataset;
        requireAuth(() => void notify(slug));
      } else if (target.closest("[data-action='toggle-coming-soon']")) {
        const expanded = comingSoonSection.classList.toggle("home-section--expanded");
        comingSoonToggle.setAttribute("aria-expanded", String(expanded));
        comingSoonToggle.textContent = expanded ? "Show less" : "See all";
      }
    },
    { signal },
  );

  const unsubscribe = appState.subscribe((state, previous) => {
    if (state.user?.id !== previous.user?.id && comingSoon.length > 0) renderComingSoon();
  });
  signal.addEventListener("abort", unsubscribe, { once: true });

  return page;
};
