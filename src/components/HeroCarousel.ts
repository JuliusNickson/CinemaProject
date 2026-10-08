import type { MovieWithSynopsis } from "../types/movie";
import { formatDayMonth } from "../utils/date";
import { html, toElement, type SafeHtml } from "../utils/dom";
import { AgeBadge, Badge } from "./Badge";
import { icon } from "./icons";

export interface HeroCarouselOptions {
  movies: MovieWithSynopsis[];
  signal: AbortSignal;
  /** Time each slide stays on screen, in milliseconds. */
  interval?: number;
}

function slideMarkup(movie: MovieWithSynopsis, index: number, total: number): SafeHtml {
  const detailsUrl = `/movies/${encodeURIComponent(movie.slug)}`;
  const backdrop = movie.backdropUrl ?? movie.posterUrl;

  return html`
    <article
      class="hero__slide"
      data-index="${index}"
      aria-roledescription="slide"
      aria-label="${index + 1} of ${total}"
    >
      ${backdrop && html`<img class="hero__backdrop" src="${backdrop}" alt="" ${index > 0 && html`loading="lazy"`} />`}
      <div class="hero__frame">
        <div class="hero__content">
          ${Badge(`PREMIERE · WEEK OF ${formatDayMonth(movie.releaseDate)}`, { tone: "brand", size: "md" })}
          <div class="hero__body">
            <div class="hero__details">
              <div class="hero__heading">
                <h2 class="hero__title text-display">${movie.title}</h2>
                <div class="hero__badges">
                  ${AgeBadge(movie.ageRating.code, "lg")}
                  ${Badge(`${movie.runtimeMinutes} Min`, { size: "lg", leadingIcon: "timer" })}
                  ${movie.formats.map((format) => Badge(format.name, { size: "lg" }))}
                </div>
              </div>
              <p class="hero__synopsis text-body-m">${movie.synopsis}</p>
            </div>
            <div class="hero__actions">
              <a class="button button--primary" href="${detailsUrl}">${icon("ticket")}Buy tickets</a>
              <a class="button button--tint" href="/sessions">All sessions</a>
            </div>
          </div>
        </div>
      </div>
    </article>
  `;
}

function carouselMarkup(movies: MovieWithSynopsis[]): SafeHtml {
  return html`
    <section class="hero" aria-roledescription="carousel" aria-label="Featured films">
      <div class="hero__slides">
        ${movies.map((movie, index) => slideMarkup(movie, index, movies.length))}
      </div>
      <div class="hero__frame hero__frame--controls">
        <div class="hero__controls">
          <div class="hero__progress">
            ${movies.map(
              (movie, index) => html`
                <button class="hero__bar" type="button" data-index="${index}" aria-label="Show ${movie.title}">
                  <span class="hero__bar-fill"></span>
                </button>
              `,
            )}
          </div>
          <div class="hero__arrows">
            <button class="hero__arrow" type="button" data-step="-1" aria-label="Previous film">
              ${icon("arrow-left")}
            </button>
            <button class="hero__arrow" type="button" data-step="1" aria-label="Next film">
              ${icon("arrow-right")}
            </button>
          </div>
        </div>
      </div>
    </section>
  `;
}

export function HeroCarousel({ movies, signal, interval = 7000 }: HeroCarouselOptions): HTMLElement {
  const root = toElement(carouselMarkup(movies));
  root.style.setProperty("--hero-interval", `${interval}ms`);

  const slides = [...root.querySelectorAll<HTMLElement>(".hero__slide")];
  const bars = [...root.querySelectorAll<HTMLButtonElement>(".hero__bar")];
  let current = 0;

  const show = (index: number) => {
    current = (index + slides.length) % slides.length;

    slides.forEach((slide, slideIndex) => {
      const active = slideIndex === current;
      slide.classList.toggle("hero__slide--active", active);
      slide.inert = !active;
    });

    bars.forEach((bar, barIndex) => {
      const active = barIndex === current;
      bar.classList.remove("hero__bar--active");
      if (active) {
        // Forces a reflow so the fill animation restarts on the same bar.
        void bar.offsetWidth;
        bar.classList.add("hero__bar--active");
      }
      bar.toggleAttribute("aria-current", active);
    });
  };

  root.addEventListener(
    "click",
    (event) => {
      const target = event.target as Element;
      const bar = target.closest<HTMLElement>(".hero__bar");
      const arrow = target.closest<HTMLElement>(".hero__arrow");

      if (bar) show(Number(bar.dataset.index));
      else if (arrow) show(current + Number(arrow.dataset.step));
    },
    { signal },
  );

  root.addEventListener(
    "animationend",
    (event) => {
      if ((event.target as Element).classList.contains("hero__bar-fill")) show(current + 1);
    },
    { signal },
  );

  if (slides.length <= 1) root.classList.add("hero--single");
  show(0);

  return root;
}
