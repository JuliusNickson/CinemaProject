import type { Session } from "../types/session";
import { hasStarted } from "../utils/date";
import { html, type SafeHtml } from "../utils/dom";
import { formatPrice } from "../utils/format";
import { icon } from "./icons";

/** At or below this many seats the counter turns red. */
const LOW_SEATS = 10;

export function SessionCard(session: Session): SafeHtml {
  const place = `${session.venue.name} · Hall ${session.hall.name}`;
  const ended = hasStarted(session.startsAt);
  const closed = session.isSoldOut || ended;
  const status = ended ? "Ended" : "Sold out";

  const content = html`
    <span class="session-card__top">
      <span class="session-card__time text-h3">${session.time}</span>
      <span class="session-card__format text-label-s">${session.format.name}</span>
    </span>
    <span class="session-card__bottom">
      <span class="session-card__place">
        <span class="text-body-s text-secondary">${session.language.code}</span>
        <span class="text-label-s">${place}</span>
      </span>
      <span class="session-card__meta">
        ${closed
          ? html`<span class="session-card__seats text-body-s text-secondary">${status}</span>`
          : html`
              <span class="session-card__seats ${session.seatsLeft <= LOW_SEATS && "session-card__seats--low"} text-body-s">
                ${icon("seats")}${session.seatsLeft} left
              </span>
            `}
        <span class="text-button">from ${formatPrice(session.price, { spaced: false })}</span>
      </span>
    </span>
  `;

  if (closed) {
    return html`
      <div class="session-card session-card--sold-out" aria-disabled="true" aria-label="${session.time}, ${status.toLowerCase()}">
        ${content}
      </div>
    `;
  }

  return html`
    <a
      class="session-card"
      href="/movies/${encodeURIComponent(session.movie.slug)}?session=${session.id}"
      aria-label="${session.time}, ${session.format.name}, ${place}, ${formatPrice(session.price)}, select seats"
    >
      ${content}
    </a>
  `;
}
