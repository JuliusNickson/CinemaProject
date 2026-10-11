import { ApiError, failureText } from "../api/client";
import { getMovie, getMovieSessions } from "../api/moviesApi";
import { forgetHold, getHold, getSession, readHold } from "../api/sessionsApi";
import { AgeBadge, Badge } from "../components/Badge";
import { openBooking } from "../components/BookingModal";
import { icon } from "../components/icons";
import { navigate, type Page } from "../router/router";
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

function hallLabel(name: string): string {
  return /^hall\b/i.test(name) ? name : `Hall ${name}`;
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

function showtimeMarkup(session: Session, blocked: boolean, ratingCode: string): SafeHtml {
  const disabled = blocked || session.isSoldOut;
  const reason = blocked
    ? `This film is rated ${ratingCode}. You cannot buy tickets for it with this account.`
    : session.isSoldOut
      ? "Sold out"
      : "Select seats";

  return html`
    <button class="showtime" type="button" data-session="${session.id}" ${disabled && "disabled"} title="${reason}">
      <span class="showtime__main">
        <span class="showtime__time">${session.time}</span>
        <span class="showtime__badges">
          <span class="showtime__lang">${session.language.code}</span>
          <span class="showtime__chip">${session.format.name}</span>
        </span>
      </span>
      <span class="showtime__split" aria-hidden="true"></span>
      <span class="showtime__aside">
        <span class="showtime__price">${formatPrice(session.price)}</span>
        <span class="showtime__left text-body-s">${icon("seats")}${session.isSoldOut ? "Sold out" : `${session.seatsLeft} left`}</span>
      </span>
    </button>
  `;
}

function sessionsMarkup(groups: VenueSessionsGroup[], blocked: boolean, ratingCode: string): SafeHtml {
  if (groups.length === 0 || groups.every((group) => group.sessions.length === 0)) {
    return html`<p class="movie-sessions__empty">No sessions are available for this date.</p>`;
  }

  return html`
    ${groups.map(
      (group) => html`
        <section class="venue-block">
          <h3 class="venue-block__name">${group.venue.name}</h3>
          <div class="venue-block__halls">
            ${hallGroups(group.sessions).map(
              ([hall, sessions]) => html`
                <div class="hall-card">
                  <p class="hall-card__name">${hallLabel(hall)}</p>
                  <div class="hall-card__grid">${sessions.map((session) => showtimeMarkup(session, blocked, ratingCode))}</div>
                </div>
              `,
            )}
          </div>
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
            <p class="text-body-s text-secondary" data-session-count>${totalSessions} sessions over the next seven days</p>
          </div>
          <p class="movie-page__notice" data-notice hidden></p>
          <div class="movie-dates" role="tablist" aria-label="Session dates">
            ${dates.map((date) => {
              const active = date === selected;
              const bookable = movie.availableDates.includes(date);
              return html`
                <button
                  class="movie-dates__day ${active && "movie-dates__day--active"}"
                  type="button"
                  role="tab"
                  data-date="${date}"
                  aria-selected="${active}"
                  ${!bookable && "disabled"}
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
          ${movie.genres.length > 0 &&
          html`
            <div class="movie-facts__item">
              <p class="text-label-s text-secondary">GENRE</p>
              <p class="text-label-m">${movie.genres.map((genre) => genre.name).join(", ")}</p>
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

export const MovieDetailsPage: Page = ({ params, query, signal }) => {
  const page = toElement(html`<article class="movie-page"><p class="movie-page__status">Loading film…</p></article>`);

  const load = async () => {
    let movie: MovieDetail;
    try {
      movie = await getMovie(params.slug, signal);
    } catch (error) {
      if (signal.aborted) return;
      console.error("Could not load movie details", error);
      const missing = error instanceof ApiError && error.status === 404;
      page.innerHTML = html`
        <section class="page page--centered">
          <h1 class="page__title">${missing ? "Film not found" : "Film details"}</h1>
          <p class="page__placeholder">
            ${missing ? "This film does not exist." : failureText(error, "The selected film could not be loaded right now.")}
          </p>
          ${missing
            ? html`<a class="button button--primary" href="/">Back to home</a>`
            : html`<button class="button button--primary" type="button" data-action="retry-film">Try again</button>`}
        </section>
      `.value;
      return;
    }

    if (signal.aborted) return;
    document.title = `${movie.title} · Kino XII`;
    addRecentlyViewed(movie);

    const dates = upcomingIsoDates(DATE_COUNT);
    const bookableDates = dates.filter((date) => movie.availableDates.includes(date));
    const byDate = new Map<string, VenueSessionsGroup[]>();
    const failedDates = new Set<string>();
    const loadDate = async (date: string) => {
      try {
        byDate.set(date, await getMovieSessions(movie.slug, date, signal));
        failedDates.delete(date);
      } catch (error) {
        if (signal.aborted) return;
        console.error("Could not load movie sessions", error);
        failedDates.add(date);
        byDate.set(date, []);
      }
    };
    await Promise.all(bookableDates.map(loadDate));
    if (signal.aborted) return;

    const totalSessions = [...byDate.values()].reduce((sum, groups) => sum + groups.reduce((count, group) => count + group.sessions.length, 0), 0);
    const sessionsFor = (date: string) => byDate.get(date) ?? [];
    const sessionById = (id: number) =>
      [...byDate.values()].flatMap((groups) => groups.flatMap((group) => group.sessions)).find((item) => item.id === id);

    const sessionParam = query.get("session");
    const requestedId = sessionParam ? Number(sessionParam) : Number.NaN;
    const requested = Number.isInteger(requestedId) ? sessionById(requestedId) : undefined;
    let selected = requested && bookableDates.includes(requested.date) ? requested.date : (bookableDates[0] ?? dates[0]);

    const paintSessions = () => {
      const slot = page.querySelector<HTMLElement>("[data-slot='sessions']");
      const count = page.querySelector<HTMLElement>("[data-session-count]");
      if (count) {
        const total = [...byDate.values()].reduce(
          (sum, groups) => sum + groups.reduce((sessions, group) => sessions + group.sessions.length, 0),
          0,
        );
        count.textContent = `${total} sessions over the next seven days`;
      }
      if (!slot) return;
      if (failedDates.has(selected)) {
        slot.innerHTML = html`
          <div class="movie-sessions__empty">
            <p>Sessions for this date could not be loaded.</p>
            <button class="button button--tint" type="button" data-action="retry-sessions">Try again</button>
          </div>
        `.value;
        return;
      }
      slot.innerHTML = sessionsMarkup(sessionsFor(selected), ageBlocked(movie), movie.ageRating.code).value;
    };

    const showNotice = (message: string) => {
      const notice = page.querySelector<HTMLElement>("[data-notice]");
      if (!notice) return;
      notice.hidden = false;
      notice.textContent = message;
    };

    const requestBooking = (chosen: Session) => {
      if (chosen.isSoldOut || signal.aborted) return;

      const openIfAllowed = () => {
        if (signal.aborted) return;
        const user = appState.get().user;
        if (!user?.profileComplete) {
          navigate("/profile");
          return;
        }
        if (ageBlocked(movie)) {
          showNotice(`This film is rated ${movie.ageRating.code}. You cannot buy tickets for it with this account.`);
          return;
        }
        openBooking({ movie, session: chosen, signal });
      };

      requireAuth(openIfAllowed);
    };

    page.innerHTML = pageMarkup(movie, dates, selected, totalSessions).value;
    paintSessions();

    page.addEventListener(
      "click",
      (event) => {
        const target = event.target as Element;
        const dateButton = target.closest<HTMLButtonElement>("[data-date]");
        const sessionButton = target.closest<HTMLButtonElement>("[data-session]");

        if (target.closest("[data-action='retry-sessions']")) {
          void loadDate(selected).then(() => {
            if (!signal.aborted) paintSessions();
          });
          return;
        }

        if (dateButton?.dataset.date && !dateButton.disabled) {
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
        requestBooking(chosen);
      },
      { signal },
    );

    const resumeHold = async () => {
      const stored = readHold();
      if (!stored || stored.movieSlug !== movie.slug) return false;

      try {
        const hold = await getHold(stored.holdId, signal);
        if (signal.aborted) return true;
        if (!hold.isLive) {
          forgetHold();
          showNotice("Your hold time expired. Please re-select your seats.");
          return false;
        }
        const fresh = await getSession(hold.sessionId, signal);
        if (signal.aborted) return true;
        openBooking({ movie, session: fresh, signal, resume: hold });
        return true;
      } catch (error) {
        if (signal.aborted) return true;
        if (error instanceof ApiError && error.isUnauthorized) {
          requireAuth(() => void resumeHold());
          return true;
        }
        forgetHold();
        return false;
      }
    };

    const resumed = await resumeHold();
    if (!resumed && requested && !requested.isSoldOut) requestBooking(requested);
  };

  page.addEventListener(
    "click",
    (event) => {
      if ((event.target as Element).closest("[data-action='retry-film']")) void load();
    },
    { signal },
  );

  void load();
  return page;
};
