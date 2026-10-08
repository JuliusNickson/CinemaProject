import { formatWeekday, parseIsoDate, upcomingIsoDates } from "../utils/date";
import { html, type SafeHtml } from "../utils/dom";

export const DATE_SELECTOR_DAYS = 7;

export function DateSelector(selected: string, labelledBy: string): SafeHtml {
  return html`
    <div class="date-selector" role="radiogroup" aria-labelledby="${labelledBy}">
      ${upcomingIsoDates(DATE_SELECTOR_DAYS).map((date) => {
        const active = date === selected;
        const full = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" }).format(
          parseIsoDate(date),
        );

        return html`
          <button
            class="date-selector__day ${active && "date-selector__day--active"}"
            type="button"
            role="radio"
            aria-checked="${String(active)}"
            aria-label="${full}"
            tabindex="${active ? "0" : "-1"}"
            data-date="${date}"
          >
            <span>${formatWeekday(date)}</span>
            <span>${parseIsoDate(date).getDate()}</span>
          </button>
        `;
      })}
    </div>
  `;
}
