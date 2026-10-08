import type { Movie } from "../types/movie";
import { formatDayMonth } from "../utils/date";
import { html, type SafeHtml } from "../utils/dom";
import { formatGenreRuntime, formatPrice } from "../utils/format";
import type { RecentlyViewedMovie } from "../utils/recentlyViewed";
import { AgeBadge } from "./Badge";
import { icon } from "./icons";

const detailsUrl = (slug: string) => `/movies/${encodeURIComponent(slug)}`;

function image(url: string | null, className: string): SafeHtml {
  return url ? html`<img class="${className}" src="${url}" alt="" loading="lazy" />` : html``;
}

/** Now Playing card: poster, title, meta, rating, price and a Buy Ticket link. */
export function MovieCardLarge(movie: Movie): SafeHtml {
  const url = detailsUrl(movie.slug);

  return html`
    <article class="card-large">
      <div class="card-large__body">
        <a class="card-large__poster" href="${url}" tabindex="-1" aria-hidden="true">
          ${image(movie.posterUrl, "card-large__image")}
        </a>
        <div class="card-large__info">
          <div class="card-large__heading">
            <h3 class="card-large__title text-h3" title="${movie.title}">
              <a href="${url}">${movie.title}</a>
            </h3>
            <p class="text-body-s text-secondary">${formatGenreRuntime(movie.genres[0]?.name, movie.runtimeMinutes)}</p>
          </div>
          ${AgeBadge(movie.ageRating.code)}
        </div>
      </div>
      <div class="card-large__footer">
        <span class="text-label-s">From ${formatPrice(movie.fromPrice)}</span>
        <a class="button button--primary button--compact" href="${url}">Buy Ticket</a>
      </div>
    </article>
  `;
}

export interface MovieCardMediumOptions {
  notified?: boolean;
}

/** Coming Soon card: release date, title, meta, rating and Notify Me. */
export function MovieCardMedium(movie: Movie, { notified = false }: MovieCardMediumOptions = {}): SafeHtml {
  return html`
    <article class="card-medium">
      <div class="card-medium__media">${image(movie.backdropUrl ?? movie.posterUrl, "card-medium__image")}</div>
      <div class="card-medium__body">
        <div class="card-medium__info">
          <p class="card-medium__release text-label-s">IN CINEMAS ${formatDayMonth(movie.releaseDate, "long")}</p>
          <div class="card-medium__group">
            <div class="card-medium__heading">
              <h3 class="card-medium__title text-label-s" title="${movie.title}">${movie.title}</h3>
              <p class="text-body-s text-secondary">${formatGenreRuntime(movie.genres[0]?.name, movie.runtimeMinutes)}</p>
            </div>
            ${AgeBadge(movie.ageRating.code)}
          </div>
        </div>
        ${NotifyButton(movie.slug, notified)}
      </div>
    </article>
  `;
}

export function NotifyButton(slug: string, notified: boolean): SafeHtml {
  return notified
    ? html`
        <button class="button button--outline card-medium__notify card-medium__notify--done" type="button" disabled>
          ${icon("check")}Notified
        </button>
      `
    : html`
        <button class="button button--outline card-medium__notify" type="button" data-action="notify" data-slug="${slug}">
          ${icon("bell")}Notify Me
        </button>
      `;
}

/** Recently viewed card: small poster, uppercase title, meta and rating. */
export function MovieCardSmall(movie: RecentlyViewedMovie): SafeHtml {
  return html`
    <a class="card-small" href="${detailsUrl(movie.slug)}">
      <span class="card-small__media">${image(movie.posterUrl, "card-small__image")}</span>
      <span class="card-small__info">
        <span class="card-small__heading">
          <span class="card-small__title text-button">${movie.title}</span>
          <span class="text-body-s text-secondary">${formatGenreRuntime(movie.genre, movie.runtimeMinutes)}</span>
        </span>
        ${AgeBadge(movie.ageRating)}
      </span>
    </a>
  `;
}
