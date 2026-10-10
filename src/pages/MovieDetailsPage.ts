import { getMovie, getMovieSessions } from "../api/moviesApi";
import { AgeBadge, Badge } from "../components/Badge";
import { openBooking } from "../components/BookingModal";
import { icon } from "../components/icons";
import type { Page } from "../router/router";
import { appState } from "../state/appState";
import { requireAuth } from "../state/requireAuth";
import type { MovieDetail } from "../types/movie";
import type { Session, VenueSessionsGroup } from "../types/session";
import { formatFullDate, formatWeekday, parseIsoDate, upcomingIsoDates } from "../utils/date";
import { html, toElement, type SafeHtml } from "../utils/dom";
import { formatPrice } from "../utils/format";
import { addRecentlyViewed } from "../utils/recentlyViewed";

const DATE_COUNT = 7;

function ageBlocked(movie: MovieDetail): boolean {
  const user = appState.get().user;
  if (!user || user.age === null) return false;
  return movie.ageRating.minAge > user.age;
}

function hallGroups(sessions: Session[]): [string, Session[]][] {
  const groups = new Map<string, Session[]>();
  sessions.forEach((session) => {
    const hall = groups.get(session.hall.name) ?? [];
    hall.push(session);
    groups.set(session.hall.name, hall);
  });
  return [...groups];
}

function showtimeMarkup(session: Session, blocked: boolean): SafeHtml {
  const disabled = blocked || session.isSoldOut;
  const reason = blocked
    ? `This film is rated ${session.movie.ageRating.code}. You cannot buy tickets for it with this account.`
    : session.isSoldOut
      ? "Sold out"
      : "Select seats";

  return html`
    <button class="showtime" type="button" data-session="${session.id}" ${disabled && "disabled"} title="${reason}">
      <span class="showtime__main">
        <span class="showtime__time text-h2">${session.time}</span>
        <span class="showtime__badges">
          <span class="showtime__chip text-body-s">${session.language.code}</span>
          <span class="showtime__chip text-body-s">${session.format.name}</span>
        </span>
      </span>
      <span class="showtime__split" aria-hidden="true"></span>
      <span class="showtime__aside">
        <span class="showtime__price text-h3">${formatPrice(session.price)}</span>
        <span class="showtime__left text-body-s">${icon("seats")}${session.isSoldOut ? "Sold out" : `${session.seatsLeft} left`}</span>
      </span>
    </button>
  `;
}

function sessionsMarkup(groups: VenueSessionsGroup[], blocked: boolean): SafeHtml {
  if (groups.length === 0 || groups.every((group) => group.sessions.length === 0)) {
    return html`<p class="movie-sessions__empty">No sessions are available for this date.</p>`;
  }

  return html`
    ${groups.map(
      (group) => html`
        <section class="venue-block">
          <h3 class="text-button">${group.venue.name}</h3>
          ${hallGroups(group.sessions).map(
            ([hall, sessions]) => html`
              <div class="hall-card">
                <p class="text-label-s">${hall}</p>
                <div class="hall-card__grid">${sessions.map((session) => showtimeMarkup(session, blocked))}</div>
              </div>
            `,
          )}
        </section>
      `,
    )}
  `;
}

function pageMarkup(movie: MovieDetail, dates: string[], selected: string, totalSessions: number): SafeHtml {
  const backdrop = movie.backdropUrl ?? movie.posterUrl;

  return html`
    <article class="movie-page">
      <header class="movie-hero">
        ${backdrop && html`<div class="movie-hero__media"><img src="${backdrop}" alt="" /></div>`}
        <div class="movie-hero__scrim"></div>
        <div class="movie-hero__content">
          <div class="movie-hero__poster">
            ${movie.posterUrl && html`<img src="${movie.posterUrl}" alt="${movie.title} poster" />`}
          </div>
          <div class="movie-hero__copy">
            ${Badge(movie.isComingSoon ? "COMING SOON" : "NOW PLAYING", { tone: "brand", size: "md" })}
            <h1 class="movie-hero__title text-display">${movie.title}</h1>
            <p class="movie-hero__synopsis text-body-m">${movie.synopsis}</p>
            <div class="movie-hero__badges">
              ${AgeBadge(movie.ageRating.code, "md")}
              ${Badge(`${movie.runtimeMinutes} Min`, { size: "lg", leadingIcon: "timer" })}
              ${movie.formats.map((format) => Badge(format.name, { size: "lg" }))}
            </div>
          </div>
        </div>
      </header>
      <div class="movie-page__body">
        <section class="movie-sessions" aria-labelledby="movie-sessions-title">
          <div class="movie-sessions__heading">
            <h2 class="text-h2" id="movie-sessions-title">Sessions</h2>
            <p class="text-body-s text-secondary">${totalSessions} sessions over the next seven days</p>
          </div>
          <p class="movie-page__notice" data-notice hidden></p>
          <div class="movie-dates" role="tablist" aria-label="Session dates">
            ${dates.map((date) => {
              const active = date === selected;
              return html`
                <button
                  class="movie-dates__day ${active && "movie-dates__day--active"}"
                  type="button"
                  role="tab"
                  data-date="${date}"
                  aria-selected="${active}"
                >
                  <span class="text-label-s">${formatWeekday(date)}</span>
                  <span class="text-h3">${parseIsoDate(date).getDate()}</span>
                </button>
              `;
            })}
          </div>
          <div data-slot="sessions"></div>
        </section>
        <aside class="movie-facts" aria-label="Film details">
          <h2 class="text-h2">Details</h2>
          ${movie.director &&
          html`
            <div class="movie-facts__item">
              <p class="text-label-s text-secondary">DIRECTOR</p>
              <p class="text-label-m">${movie.director}</p>
            </div>
          `}
          ${movie.cast &&
          html`
            <div class="movie-facts__item">
              <p class="text-label-s text-secondary">MAIN CAST</p>
              <p class="text-label-m">${movie.cast}</p>
            </div>
          `}
          <div class="movie-facts__item">
            <p class="text-label-s text-secondary">DURATION</p>
            <p class="text-label-m">${movie.runtimeMinutes} minutes</p>
          </div>
          <div class="movie-facts__item">
            <p class="text-label-s text-secondary">RELEASE DATE</p>
            <p class="text-label-m">${formatFullDate(movie.releaseDate)}</p>
          </div>
          <div class="movie-facts__item">
            <p class="text-label-s text-secondary">FORMATS</p>
            <p class="text-label-m">${movie.formats.map((format) => format.name).join(", ") || "—"}</p>
          </div>
          <div class="movie-facts__item">
            <p class="text-label-s text-secondary">FROM</p>
            <p class="movie-facts__price text-h3">${formatPrice(movie.fromPrice)}</p>
          </div>
          <div class="movie-facts__note">
            <p class="text-label-s">RATING NOTE</p>
            <p class="text-body-s"><strong>${movie.ageRating.code}</strong> ${movie.ageRating.description}</p>
          </div>
        </aside>
      </div>
    </article>
  `;
}

export const MovieDetailsPage: Page = ({ params, signal }) => {
  const page = toElement(html`<article class="movie-page"><p class="movie-page__status">Loading film…</p></article>`);

  const load = async () => {
    let movie: MovieDetail;
    try {
      movie = await getMovie(params.slug, signal);
    } catch (error) {
      if (signal.aborted) return;
      console.error("Could not load movie details", error);
      page.innerHTML = html`
        <section class="page page--centered">
          <h1 class="page__title">Film details</h1>
          <p class="page__placeholder">The selected film could not be loaded right now.</p>
        </section>
      `.value;
      return;
    }

    if (signal.aborted) return;
    document.title = `${movie.title} · Kino XII`;
    addRecentlyViewed(movie);

    const dates = upcomingIsoDates(DATE_COUNT);
    const byDate = new Map<string, VenueSessionsGroup[]>();
    const results = await Promise.all(
      dates.map(async (date) => {
        try {
          return [date, await getMovieSessions(movie.slug, date, signal)] as const;
        } catch (error) {
          console.error("Could not load movie sessions", error);
          return [date, [] as VenueSessionsGroup[]] as const;
        }
      }),
    );
    if (signal.aborted) return;
    results.forEach(([date, groups]) => byDate.set(date, groups));

    const totalSessions = results.reduce((sum, [, groups]) => sum + groups.reduce((count, group) => count + group.sessions.length, 0), 0);
    let selected = dates[0];
    const sessionsFor = (date: string) => byDate.get(date) ?? [];
    const sessionById = (id: number) =>
      [...byDate.values()].flatMap((groups) => groups.flatMap((group) => group.sessions)).find((item) => item.id === id);

    const paintSessions = () => {
      const slot = page.querySelector<HTMLElement>("[data-slot='sessions']");
      if (!slot) return;
      slot.innerHTML = sessionsMarkup(sessionsFor(selected), ageBlocked(movie)).value;
    };

    const showNotice = (message: string) => {
      const notice = page.querySelector<HTMLElement>("[data-notice]");
      if (!notice) return;
      notice.hidden = false;
      notice.innerHTML = message;
    };

    page.innerHTML = pageMarkup(movie, dates, selected, totalSessions).value;
    paintSessions();

    page.addEventListener(
      "click",
      (event) => {
        const target = event.target as Element;
        const dateButton = target.closest<HTMLButtonElement>("[data-date]");
        const sessionButton = target.closest<HTMLButtonElement>("[data-session]");

        if (dateButton?.dataset.date) {
          selected = dateButton.dataset.date;
          page.querySelectorAll<HTMLButtonElement>("[data-date]").forEach((button) => {
            const active = button.dataset.date === selected;
            button.classList.toggle("movie-dates__day--active", active);
            button.setAttribute("aria-selected", String(active));
          });
          paintSessions();
          return;
        }

        if (!sessionButton?.dataset.session || sessionButton.disabled) return;
        const chosen = sessionById(Number(sessionButton.dataset.session));
        if (!chosen) return;

        const user = appState.get().user;
        if (user && !user.profileComplete) {
          showNotice(`Please complete your profile to enable booking. <a href="/profile">Go to profile</a>`);
          return;
        }

        requireAuth(() => openBooking({ movie, session: chosen, signal }));
      },
      { signal },
    );
  };

  void load();
  return page;
};
