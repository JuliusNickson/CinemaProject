import {
  availableFormats,
  countActiveFilters,
  type SessionsFilterKey,
  type SessionsQuery,
} from "../state/sessionFiltersState";
import type { FilterOptions } from "../types/session";
import { html, type SafeHtml } from "../utils/dom";
import { formatLanguage, splitTimeBandLabel } from "../utils/format";
import { DateSelector } from "./DateSelector";
import { icon } from "./icons";

interface CheckOption {
  value: string;
  label: string;
  hint?: string | null;
}

function checkRow(key: SessionsFilterKey, option: CheckOption, checked: boolean): SafeHtml {
  return html`
    <label class="check-row">
      <input
        class="check-row__input"
        type="checkbox"
        name="${key}"
        value="${option.value}"
        data-filter="${key}"
        ${checked && html`checked`}
      />
      <span class="check-row__box" aria-hidden="true">${icon("tick")}</span>
      <span class="check-row__label">
        <span class="text-label-m">${option.label}</span>
        ${option.hint && html`<span class="text-body-s text-secondary">· ${option.hint}</span>`}
      </span>
    </label>
  `;
}

function filterGroup(id: string, title: string, content: SafeHtml): SafeHtml {
  return html`
    <div class="filter-group" role="group" aria-labelledby="${id}">
      <h3 class="filter-group__title text-overline text-secondary" id="${id}">${title}</h3>
      ${content}
    </div>
    <hr class="filter-sidebar__divider" />
  `;
}

function checkGroup(
  key: SessionsFilterKey,
  title: string,
  options: CheckOption[],
  selected: readonly string[],
): SafeHtml {
  return filterGroup(
    `filter-${key}`,
    title,
    html`${options.map((option) => checkRow(key, option, selected.includes(option.value)))}`,
  );
}

export function FilterSidebar(query: SessionsQuery, options: FilterOptions): SafeHtml {
  const active = countActiveFilters(query);

  return html`
    <form class="filter-sidebar" aria-label="Filters">
      <div class="filter-sidebar__body">
        <h2 class="text-h3">Filters</h2>
        <div class="filter-sidebar__groups">
          ${checkGroup(
            "venues",
            "Venue",
            options.venues.map((venue) => ({ value: venue.slug, label: venue.name, hint: venue.city })),
            query.venues,
          )}
          ${filterGroup("filter-date", "Date", DateSelector(query.date, "filter-date"))}
          ${checkGroup(
            "formats",
            "Format",
            availableFormats(options, query.venues).map((format) => ({ value: format.slug, label: format.name })),
            query.formats,
          )}
          ${checkGroup(
            "languages",
            "Language",
            options.languages.map((language) => ({ value: language.slug, label: formatLanguage(language) })),
            query.languages,
          )}
          ${checkGroup(
            "bands",
            "Time of day",
            options.timeBands.map((band) => {
              const { name, hint } = splitTimeBandLabel(band.label);
              return { value: band.id, label: name, hint };
            }),
            query.bands,
          )}
        </div>
      </div>
      <div class="filter-sidebar__footer">
        ${active > 0 &&
        html`<button class="button button--outline filter-sidebar__clear" type="button" data-action="clear-filters">
          Clear filters
        </button>`}
        <p class="text-body-s text-secondary" aria-live="polite">${active} ${active === 1 ? "filter" : "filters"} active</p>
      </div>
    </form>
  `;
}
