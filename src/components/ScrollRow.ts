import { html, type SafeHtml } from "../utils/dom";

export function ScrollRow(items: SafeHtml[], label: string): SafeHtml {
  return html`
    <div class="scroll-row">
      <div class="scroll-row__track" role="list" aria-label="${label}">
        ${items.map((item) => html`<div class="scroll-row__item" role="listitem">${item}</div>`)}
      </div>
    </div>
  `;
}

/** Hides the edge fade once the row is scrolled to its end or does not overflow. */
export function watchScrollRow(row: HTMLElement, signal: AbortSignal): void {
  const track = row.querySelector<HTMLElement>(".scroll-row__track");
  if (!track) return;

  const update = () => {
    const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 1;
    row.classList.toggle("scroll-row--at-end", atEnd);
  };

  const resizeObserver = new ResizeObserver(update);
  resizeObserver.observe(track);
  track.addEventListener("scroll", update, { passive: true, signal });
  signal.addEventListener("abort", () => resizeObserver.disconnect(), { once: true });
  update();
}
