import { html, type SafeHtml } from "../utils/dom";
import { icon } from "./icons";

type PageItem = number | "gap";

/** First, last and the pages around the current one, with gaps in between. */
function pageItems(current: number, last: number): PageItem[] {
  if (last <= 7) return Array.from({ length: last }, (_, index) => index + 1);

  const start = Math.max(2, current - 1);
  const end = Math.min(last - 1, current + 1);
  const items: PageItem[] = [1];

  if (start > 2) items.push("gap");
  for (let page = start; page <= end; page += 1) items.push(page);
  if (end < last - 1) items.push("gap");
  items.push(last);

  return items;
}

function arrow(direction: "prev" | "next", target: number | null, hrefFor: (page: number) => string): SafeHtml {
  const label = direction === "prev" ? "Previous page" : "Next page";
  const glyph = icon(direction === "prev" ? "chevron-left" : "chevron-right");

  return target === null
    ? html`<span class="pagination__arrow" aria-disabled="true" aria-label="${label}">${glyph}</span>`
    : html`<a class="pagination__arrow" href="${hrefFor(target)}" aria-label="${label}">${glyph}</a>`;
}

export function Pagination(current: number, last: number, hrefFor: (page: number) => string): SafeHtml {
  if (last <= 1) return html``;

  return html`
    <nav class="pagination" aria-label="Pagination">
      ${arrow("prev", current > 1 ? current - 1 : null, hrefFor)}
      ${pageItems(current, last).map((item) => {
        if (item === "gap") return html`<span class="pagination__gap" aria-hidden="true">...</span>`;
        if (item === current) {
          return html`<span class="pagination__page pagination__page--current" aria-current="page">${item}</span>`;
        }
        return html`<a class="pagination__page" href="${hrefFor(item)}" aria-label="Page ${item} of ${last}">${item}</a>`;
      })}
      ${arrow("next", current < last ? current + 1 : null, hrefFor)}
    </nav>
  `;
}
