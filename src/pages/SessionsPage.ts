import { getFilterOptions, getSessions } from "../api/sessionsApi";
import { AgeBadge } from "../components/Badge";
import { FilterSidebar } from "../components/FilterSidebar";
import { icon } from "../components/icons";
import { Pagination } from "../components/Pagination";
import { ScrollRow, watchScrollRow } from "../components/ScrollRow";
import { SessionCard } from "../components/SessionCard";
import { navigate, type Page } from "../router/router";
import { appState } from "../state/appState";
import {
  clearFilters,
  countActiveFilters,
  parseSessionsQuery,
  sessionsUrl,
  toApiFilters,
  toggleFilter,
  type SessionsFilterKey,
  type SessionsQuery,
} from "../state/sessionFiltersState";
import type { FilterOptions, MovieSessionsGroup, SessionSort, SessionsPage as SessionsResult } from "../types/session";
import { html, toElement, type SafeHtml } from "../utils/dom";

function pageMarkup(): SafeHtml {
  return html`
    <div class="sessions-page">
      <header class="sessions-page__header">
        <h1 class="text-h1">Sessions</h1>
        <p class="text-body-m text-secondary">Browse showtimes across all venues</p>
      </header>
      <aside class="sessions-page__sidebar" data-slot="sidebar">
        <div class="filter-sidebar skeleton" aria-hidden="true"></div>
      </aside>
      <section class="sessions-page__results" aria-label="Sessions">
        <div class="sessions-results">
          <div class="sessions-results__bar">
            <p class="text-label-m" data-slot="count" aria-live="polite"></p>
            <label class="sort-select" data-slot="sort" hidden>
              <span class="text-body-m text-secondary">Sort:</span>
              <span class="sort-select__value text-button"></span>
              ${icon("chevron-down")}
              <select class="sort-select__control" aria-label="Sort sessions"></select>
            </label>
          </div>
          <div data-slot="list"></div>
        </div>
        <div data-slot="pagination"></div>
      </section>
    </div>
  `;
}

function groupMarkup({ movie, sessions }: MovieSessionsGroup): SafeHtml {
  const url = `/movies/${encodeURIComponent(movie.slug)}`;

  return html`
    <article class="session-group" aria-labelledby="session-group-${movie.id}">
      <header class="session-group__header">
        <a class="session-group__poster" href="${url}" tabindex="-1" aria-hidden="true">
          ${movie.posterUrl && html`<img src="${movie.posterUrl}" alt="" loading="lazy" />`}
        </a>
        <div class="session-group__info">
          <div class="session-group__title-row">
            <h2 class="text-h3" id="session-group-${movie.id}"><a href="${url}">${movie.title}</a></h2>
            ${AgeBadge(movie.ageRating.code)}
          </div>
          <p class="text-body-m text-secondary">${movie.runtimeMinutes} min</p>
        </div>
      </header>
      ${ScrollRow(sessions.map(SessionCard), `${movie.title} sessions`)}
    </article>
  `;
}

function listMarkup(groups: MovieSessionsGroup[]): SafeHtml {
  return html`
    <div class="sessions-list">
      ${groups.map((group, index) => html`${index > 0 && html`<hr class="sessions-list__divider" />`}${groupMarkup(group)}`)}
    </div>
  `;
}

function skeletonMarkup(): SafeHtml {
  return html`
    <div class="sessions-list" aria-hidden="true">
      ${Array.from(
        { length: 3 },
        (_, index) => html`
          ${index > 0 && html`<hr class="sessions-list__divider" />`}
          <div class="session-group">
            <div class="session-group__header">
              <div class="session-group__poster skeleton"></div>
            </div>
            <div class="sessions-list__skeleton-row">
              ${Array.from({ length: 5 }, () => html`<div class="session-card skeleton"></div>`)}
            </div>
          </div>
        `,
      )}
    </div>
  `;
}

function messageMarkup(text: string, action?: SafeHtml): SafeHtml {
  return html`
    <div class="sessions-results__message">
      <p class="text-body-m text-secondary">${text}</p>
      ${action}
    </div>
  `;
}

export const SessionsPage: Page = ({ signal, onQueryChange }) => {
  document.title = "Sessions · Kino XII";

  const page = toElement(pageMarkup());
  const slot = <T extends HTMLElement = HTMLElement>(name: string) =>
    page.querySelector<T>(`[data-slot='${name}']`)!;
  const sidebarSlot = slot("sidebar");
  const countSlot = slot("count");
  const sortSlot = slot<HTMLLabelElement>("sort");
  const listSlot = slot("list");
  const paginationSlot = slot("pagination");
  const sortValue = sortSlot.querySelector<HTMLElement>(".sort-select__value")!;
  const sortControl = sortSlot.querySelector<HTMLSelectElement>("select")!;

  let options: FilterOptions | null = null;
  let query: SessionsQuery | null = null;
  let loadController: AbortController | null = null;

  const go = (next: SessionsQuery, replace = false) => navigate(sessionsUrl(next), { replace });

  const renderSidebar = () => {
    if (!options || !query) return;

    const focused = document.activeElement as HTMLElement | null;
    const focusKey = focused?.dataset.filter
      ? `[data-filter='${focused.dataset.filter}'][value='${CSS.escape((focused as HTMLInputElement).value)}']`
      : focused?.dataset.date
        ? ".date-selector__day--active"
        : null;
    const dayScroll = sidebarSlot.querySelector(".date-selector")?.scrollLeft ?? 0;

    sidebarSlot.innerHTML = FilterSidebar(query, options).value;

    const days = sidebarSlot.querySelector<HTMLElement>(".date-selector");
    if (days) days.scrollLeft = dayScroll;
    if (focusKey) sidebarSlot.querySelector<HTMLElement>(focusKey)?.focus({ preventScroll: true });
  };

  const renderSort = () => {
    if (!options || !query) return;
    sortControl.innerHTML = html`${options.sorts.map(
      (sort) => html`<option value="${sort.id}" ${sort.id === query?.sort && html`selected`}>${sort.label}</option>`,
    )}`.value;
    sortValue.textContent = options.sorts.find((sort) => sort.id === query?.sort)?.label ?? "";
    sortSlot.hidden = false;
  };

  const renderResults = (result: SessionsResult) => {
    if (!query) return;
    const { data, meta } = result;

    if (meta.lastPage > 0 && query.page > meta.lastPage) {
      go({ ...query, page: meta.lastPage }, true);
      return;
    }

    countSlot.textContent = meta.totalSessions > 0 ? `Showing ${meta.totalSessions} sessions` : "No sessions found";

    if (data.length === 0) {
      const filtered = countActiveFilters(query) > 0;
      listSlot.innerHTML = messageMarkup(
        filtered ? "No sessions match these filters." : "There are no sessions on this date.",
        filtered
          ? html`<button class="button button--tint" type="button" data-action="clear-filters">Clear filters</button>`
          : undefined,
      ).value;
    } else {
      listSlot.innerHTML = listMarkup(data).value;
      listSlot.querySelectorAll<HTMLElement>(".scroll-row").forEach((row) => watchScrollRow(row, signal));
    }

    const current = query;
    paginationSlot.innerHTML = Pagination(meta.currentPage, meta.lastPage, (target) =>
      sessionsUrl({ ...current, page: target }),
    ).value;
  };

  const loadResults = async () => {
    if (!query) return;

    loadController?.abort();
    const controller = new AbortController();
    loadController = controller;
    const requestSignal = AbortSignal.any([signal, controller.signal]);

    const hasResults = listSlot.querySelector(".sessions-list:not([aria-hidden])") !== null;
    if (hasResults) listSlot.classList.add("sessions-results__list--loading");
    else {
      listSlot.innerHTML = skeletonMarkup().value;
      countSlot.textContent = "";
    }

    try {
      const result = await getSessions(toApiFilters(query), requestSignal);
      if (!requestSignal.aborted) renderResults(result);
    } catch (error) {
      if (requestSignal.aborted) return;
      console.error("Sessions could not be loaded", error);
      countSlot.textContent = "";
      paginationSlot.innerHTML = "";
      listSlot.innerHTML = messageMarkup(
        "Sessions could not be loaded.",
        html`<button class="button button--tint" type="button" data-action="retry">Try again</button>`,
      ).value;
    } finally {
      if (loadController === controller) listSlot.classList.remove("sessions-results__list--loading");
    }
  };

  const apply = (params: URLSearchParams) => {
    if (!options) return;
    const previousPage = query?.page;
    query = parseSessionsQuery(params, options);

    renderSidebar();
    renderSort();
    void loadResults();

    if (previousPage !== undefined && previousPage !== query.page) window.scrollTo({ top: 0 });
  };

  const start = async () => {
    options = appState.get().filterOptions;

    if (!options) {
      try {
        options = await getFilterOptions(signal);
        appState.set({ filterOptions: options });
      } catch (error) {
        if (signal.aborted) return;
        console.error("Filter options could not be loaded", error);
        sidebarSlot.innerHTML = "";
        listSlot.innerHTML = messageMarkup(
          "Filters could not be loaded.",
          html`<button class="button button--tint" type="button" data-action="restart">Try again</button>`,
        ).value;
        return;
      }
    }

    apply(new URLSearchParams(window.location.search));
  };

  page.addEventListener(
    "change",
    (event) => {
      const target = event.target as HTMLInputElement | HTMLSelectElement;
      if (!options || !query) return;

      if (target instanceof HTMLInputElement && target.dataset.filter) {
        go(toggleFilter(query, target.dataset.filter as SessionsFilterKey, target.value, options));
      } else if (target === sortControl) {
        go({ ...query, sort: target.value as SessionSort, page: 1 });
      }
    },
    { signal },
  );

  page.addEventListener(
    "click",
    (event) => {
      const target = event.target as Element;
      const day = target.closest<HTMLElement>("[data-date]");
      const action = target.closest<HTMLElement>("[data-action]")?.dataset.action;

      if (day?.dataset.date && query && day.dataset.date !== query.date) {
        go({ ...query, date: day.dataset.date, page: 1 });
      } else if (action === "clear-filters" && query) {
        go(clearFilters(query));
      } else if (action === "retry") {
        void loadResults();
      } else if (action === "restart") {
        void start();
      }
    },
    { signal },
  );

  page.addEventListener(
    "keydown",
    (event) => {
      const day = (event.target as Element).closest<HTMLElement>(".date-selector__day");
      if (!day || (event.key !== "ArrowRight" && event.key !== "ArrowLeft")) return;

      event.preventDefault();
      const sibling = event.key === "ArrowRight" ? day.nextElementSibling : day.previousElementSibling;
      (sibling as HTMLElement | null)?.click();
    },
    { signal },
  );

  onQueryChange(apply);
  void start();

  return page;
};
