import { ApiError } from "../api/client";
import { getSeatMap, holdSeats, releaseHold } from "../api/sessionsApi";
import { createOrder } from "../api/ticketsApi";
import { appState } from "../state/appState";
import type { Movie } from "../types/movie";
import type { Seat, SeatMap, SeatState } from "../types/seat";
import type { Session } from "../types/session";
import type { Order, TicketType, TicketTypeSlug } from "../types/ticket";
import { formatSessionDate, formatShortSessionDate } from "../utils/date";
import { html, toElement, type SafeHtml } from "../utils/dom";
import { formatLanguage, formatPrice } from "../utils/format";
import { icon } from "./icons";

export interface BookingOptions {
  movie: Movie;
  session: Session;
  signal: AbortSignal;
}

interface Selection {
  seatId: number;
  code: string;
  ticketType: TicketTypeSlug;
}

type Step = "seats" | "checkout" | "confirmed";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function ticketPrice(sessionPrice: number, ratio: number): number {
  return Math.round(sessionPrice * ratio * 100) / 100;
}

function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function sessionLine(session: Session, long = false): string {
  const date = long ? formatSessionDate(session.date) : formatShortSessionDate(session.date);
  return `${session.venue.name} · Hall ${session.hall.name} · ${date} · ${session.time}${
    long ? ` · ${session.format.name} · ${formatLanguage(session.language)}` : ""
  }`;
}

function countTickets(seats: { ticketType: { name: string } }[], types: TicketType[]): string {
  return types
    .map((type) => {
      const count = seats.filter((seat) => seat.ticketType.name === type.name).length;
      return count > 0 ? `${count} x ${type.name}` : "";
    })
    .filter(Boolean)
    .join(", ");
}

export function openBooking({ movie, session, signal }: BookingOptions): void {
  if (document.querySelector(".booking")) return;

  const options = appState.get().filterOptions;
  const typeOrder = ["child", "student", "adult"];
  const ticketTypes = [...(options?.ticketTypes ?? [])].sort(
    (a, b) => typeOrder.indexOf(a.slug) - typeOrder.indexOf(b.slug),
  );
  const maxSeats = options?.maxSeatsPerOrder ?? 3;
  const user = appState.get().user;

  const root = toElement(html`<div class="booking" role="presentation"></div>`);
  const previousOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  document.body.append(root);

  let step: Step = "seats";
  let seatMap: SeatMap | null = null;
  let loadError = "";
  let alert = "";
  let selection: Selection[] = [];
  let holdId: string | null = null;
  let expiresAt = 0;
  let order: Order | null = null;
  let paying = false;
  let holding = false;
  const fields = {
    fullName: user?.fullName ?? "",
    email: user?.email ?? "",
    mobileNumber: user?.mobileNumber ?? "",
    cardNumber: "",
    expiry: "",
    cvv: "",
  };
  const fieldErrors: Record<string, string> = {};
  let timerId = 0;

  const typeBySlug = (slug: TicketTypeSlug) => ticketTypes.find((type) => type.slug === slug);
  const defaultType = (): TicketTypeSlug => "adult";
  const blocked = (type: TicketType) =>
    type.blockedFromRatingAge !== null && movie.ageRating.minAge >= type.blockedFromRatingAge;

  const priceOf = (slug: TicketTypeSlug) => ticketPrice(session.price, typeBySlug(slug)?.priceRatio ?? 1);

  const subtotal = () => selection.reduce((sum, seat) => sum + priceOf(seat.ticketType), 0);

  const secondsLeft = () => (expiresAt ? Math.ceil((expiresAt - Date.now()) / 1000) : 0);

  const close = () => {
    window.clearInterval(timerId);
    if (holdId && step !== "confirmed") void releaseHold(holdId).catch(() => undefined);
    document.body.style.overflow = previousOverflow;
    root.remove();
  };

  const paintTimer = () => {
    const node = root.querySelector<HTMLElement>("[data-timer]");
    if (node) node.textContent = holdId ? formatClock(secondsLeft()) : "8:00";
  };

  const expireHold = () => {
    holdId = null;
    expiresAt = 0;
    selection = [];
    step = "seats";
    alert = "Your hold time expired. Please re-select your seats.";
    void loadMap();
  };

  const render = () => {
    root.innerHTML = dialogMarkup().value;
    paintTimer();
  };

  const loadMap = async () => {
    loadError = "";
    try {
      seatMap = await getSeatMap(session.id, signal);
      const mine = new Set(selection.map((seat) => seat.seatId));
      seatMap.sections.forEach((section) => {
        section.rows.forEach((row) => {
          row.seats.forEach((seat) => {
            if (seat.isMine) seat.state = "available";
            if (mine.has(seat.id) && seat.state !== "available" && !seat.isMine) {
              selection = selection.filter((item) => item.seatId !== seat.id);
            }
          });
        });
      });
    } catch (error) {
      if (signal.aborted) return;
      console.error("Seat map could not be loaded", error);
      loadError = "The seat map could not be loaded.";
    }
    if (!signal.aborted) render();
  };

  function seatButton(seat: Seat): SafeHtml {
    const selected = selection.some((item) => item.seatId === seat.id);
    const state: SeatState | "selected" = selected ? "selected" : seat.state;
    const disabled = !selected && seat.state !== "available";
    return html`
      <button
        class="seat seat--${state}"
        type="button"
        data-seat="${seat.id}"
        data-code="${seat.code}"
        ${disabled && "disabled"}
        aria-label="Seat ${seat.code}, ${state}"
        aria-pressed="${selected}"
      >${seat.label}</button>
      ${seat.aisleAfter && html`<span class="booking__aisle"></span>`}
    `;
  }

  function seatsMarkup(): SafeHtml {
    if (loadError) return html`<p class="booking__alert">${loadError}</p>`;
    if (!seatMap) return html`<p class="booking__hint">Loading seats…</p>`;

    return html`
      <div class="booking__map">
        <div class="booking__screen text-label-s">SCREEN</div>
        ${seatMap.sections.map((section) => {
          const labels = section.rows.map((row) => row.label);
          const span = labels.length > 1 ? `${labels[0]}–${labels[labels.length - 1]}` : (labels[0] ?? "");
          return html`
            <section class="booking__section">
              <p class="booking__section-label text-label-s">${section.name.toUpperCase()} · ROWS ${span}</p>
              ${section.rows.map(
                (row) => html`
                  <div class="booking__row">
                    <span class="booking__row-label text-label-s">${row.label}</span>
                    <div class="booking__seats">${row.seats.map(seatButton)}</div>
                  </div>
                `,
              )}
            </section>
          `;
        })}
        <div class="booking__legend text-body-s">
          <span class="booking__legend-item"><span class="booking__swatch"></span>Available</span>
          <span class="booking__legend-item"><span class="booking__swatch booking__swatch--selected"></span>Selected</span>
          <span class="booking__legend-item"><span class="booking__swatch booking__swatch--sold"></span>Sold</span>
          <span class="booking__legend-item"><span class="booking__swatch booking__swatch--held"></span>Held by another user</span>
        </div>
      </div>
    `;
  }

  function picksMarkup(): SafeHtml {
    return html`
      ${selection.map((seat) => {
        const type = typeBySlug(seat.ticketType);
        return html`
          <article class="booking-pick">
            <div class="booking-pick__top">
              <span class="text-label-m">Seat <strong>${seat.code}</strong></span>
              <span class="booking-pick__price text-label-m">${formatPrice(priceOf(seat.ticketType))}</span>
              <button class="booking-pick__remove" type="button" data-remove="${seat.seatId}" aria-label="Remove seat ${seat.code}">×</button>
            </div>
            <div class="booking-pick__types">
              ${ticketTypes.map((option) => {
                const percent = Math.round(option.priceRatio * 100);
                return html`
                  <button
                    class="booking-pick__type text-label-s ${option.slug === type?.slug && "booking-pick__type--active"}"
                    type="button"
                    data-type="${option.slug}"
                    data-seat="${seat.seatId}"
                    ${blocked(option) && "disabled"}
                    title="${blocked(option) ? (option.note ?? "Not available for this rating") : ""}"
                  >${option.name} ${percent}%</button>
                `;
              })}
            </div>
          </article>
        `;
      })}
    `;
  }

  function fieldMarkup(name: keyof typeof fields, label: string, placeholder: string, wide = false): SafeHtml {
    const value = fields[name];
    const error = fieldErrors[name];
    const valid = value.trim().length > 0 && !error;
    return html`
      <label class="booking__field ${wide && "booking__field--wide"}">
        <span class="booking__label text-label-s">${label}</span>
        <span class="booking__control">
          <input name="${name}" value="${value}" placeholder="${placeholder}" autocomplete="off" />
          ${valid && html`<span class="booking__check">${icon("check")}</span>`}
        </span>
        ${error && html`<span class="booking__error text-body-s">${error}</span>`}
      </label>
    `;
  }

  function stepsMarkup(onSeats: boolean): SafeHtml {
    return html`
      <div class="booking__steps">
        <button class="booking__step text-label-s ${onSeats && "booking__step--active"}" type="button" data-step="seats">SEATS</button>
        <button class="booking__step text-label-s ${!onSeats && "booking__step--active"}" type="button" data-step="checkout" ${!holdId && "disabled"}>CHECKOUT</button>
      </div>
    `;
  }

  function checkoutMarkup(): SafeHtml {
    return html`
      <form class="booking__form" novalidate>
        <div class="booking__fields">
          ${fieldMarkup("fullName", "Full Name", "e.g. Text", true)}
          ${fieldMarkup("email", "Email", "e.g. Text")}
          ${fieldMarkup("mobileNumber", "Mobile Number", "e.g. Text")}
        </div>
        <hr class="booking__divider" />
        <div class="booking__fields">
          ${fieldMarkup("cardNumber", "Card Number", "e.g. Text", true)}
          ${fieldMarkup("expiry", "Expiry", "e.g. 12/34")}
          ${fieldMarkup("cvv", "CVV", "e.g. 123")}
        </div>
      </form>
    `;
  }

  function checkoutSummary(): SafeHtml {
    const held = selection.map((seat) => ({ ticketType: { name: typeBySlug(seat.ticketType)?.name ?? seat.ticketType } }));
    const ready = checkoutErrors().length === 0;
    return html`
      <aside class="booking__summary">
        <h3 class="text-button">Summary</h3>
        <div class="booking-order">
          <div>
            <p class="text-button">${movie.title.toUpperCase()}</p>
            <p class="booking-order__place text-body-s">Hall ${session.hall.name} · ${formatShortSessionDate(session.date)} · ${session.time}</p>
          </div>
          <div class="booking-order__row text-body-s"><span>Seats</span><strong>${selection.map((seat) => seat.code).join(", ")}</strong></div>
          <div class="booking-order__row text-body-s"><span>Tickets</span><strong>${countTickets(held, ticketTypes)}</strong></div>
        </div>
        <div class="booking__total">
          <span class="text-label-s">SUBTOTAL</span>
          <span class="text-h1">${formatPrice(subtotal())}</span>
        </div>
        <button class="button button--primary booking__next" type="button" data-action="pay" ${(!ready || paying) && "disabled"}>
          ${paying ? "Processing…" : "Pay: Complete order"}
        </button>
      </aside>
    `;
  }

  function confirmedMarkup(): SafeHtml {
    if (!order) return html``;
    const grouped = countTickets(order.tickets, ticketTypes);
    return html`
      <div class="booking__confirmed">
        <div class="booking__confirmed-icon">${icon("check")}</div>
        <h2 class="text-h1">Booking confirmed!</h2>
        <p class="text-body-m text-secondary">Your tickets are ready. We've sent the confirmation to your email.</p>
        <p class="booking__reference text-label-s">ORDER #${order.reference}</p>
        <div class="booking__ticket">
          <div class="booking__ticket-head">
            <div class="booking__ticket-poster">
              ${movie.posterUrl && html`<img src="${movie.posterUrl}" alt="" />`}
            </div>
            <div>
              <p class="text-button">${movie.title.toUpperCase()}</p>
              <p class="text-body-s text-secondary">${sessionLine(session)}</p>
            </div>
          </div>
          <div class="booking__ticket-row text-body-s"><span>Seats</span><strong>${order.tickets.map((ticket) => ticket.seatCode).join(", ")}</strong></div>
          <div class="booking__ticket-row text-body-s"><span>Tickets</span><strong>${grouped}</strong></div>
          <div class="booking__ticket-row text-body-s"><span>TOTAL PAID</span><strong class="text-h3">${formatPrice(order.totalPrice)}</strong></div>
        </div>
        <div class="booking__actions">
          <a class="button button--primary" href="/profile?tab=tickets">View my tickets</a>
          <a class="button button--tint" href="/">Back to home</a>
        </div>
      </div>
    `;
  }

  function dialogMarkup(): SafeHtml {
    const onSeats = step === "seats";
    return html`
      <div class="booking__dialog" role="dialog" aria-modal="true" aria-label="Buy tickets">
        ${step !== "confirmed" &&
        html`
          <header class="booking__header">
            <div>
              <h2 class="text-h2">${movie.title.toUpperCase()}</h2>
              <p class="booking__meta text-body-s">${sessionLine(session, true)}</p>
            </div>
            <div class="booking__header-side">
              <div class="booking__timer">
                <span class="booking__timer-label text-label-s">SEATS HELD</span>
                <span class="text-button" data-timer>8:00</span>
              </div>
              <button class="booking__close" type="button" data-action="close" aria-label="Close">×</button>
            </div>
          </header>
          ${alert && html`<p class="booking__alert text-body-s">${alert}</p>`}
          <div class="booking__layout">
            <div class="booking__main">
              ${stepsMarkup(onSeats)}
              ${onSeats ? seatsMarkup() : checkoutMarkup()}
            </div>
            ${onSeats
              ? html`
                  <aside class="booking__summary">
                    <h3 class="text-button">Your seats · Max ${maxSeats}</h3>
                    <p class="booking__hint text-body-s">Pick up to ${maxSeats} seats from the map. Each seat can carry its own ticket type.</p>
                    ${picksMarkup()}
                    <div class="booking__total">
                      <span class="text-label-s">SUBTOTAL</span>
                      <span class="text-h1">${formatPrice(subtotal())}</span>
                    </div>
                    <button class="button button--primary booking__next" type="button" data-action="hold" ${(selection.length === 0 || holding) && "disabled"}>
                      ${holding ? "Holding seats…" : "Next: Checkout"}
                    </button>
                  </aside>
                `
              : checkoutSummary()}
          </div>
        `}
        ${step === "confirmed" &&
        html`
          <button class="booking__close" type="button" data-action="close" aria-label="Close">×</button>
          ${confirmedMarkup()}
        `}
      </div>
    `;
  }

  function checkoutErrors(): string[] {
    const problems: string[] = [];
    const name = fields.fullName.trim();
    const mobile = fields.mobileNumber.replace(/\s+/g, "");
    const card = fields.cardNumber.replace(/\s+/g, "");
    if (name.length < 3) problems.push("fullName");
    if (!EMAIL_PATTERN.test(fields.email.trim())) problems.push("email");
    if (!/^5\d{8}$/.test(mobile)) problems.push("mobileNumber");
    if (!/^\d{16}$/.test(card)) problems.push("cardNumber");
    if (!expiryValid(fields.expiry.trim())) problems.push("expiry");
    if (!/^\d{3}$/.test(fields.cvv.trim())) problems.push("cvv");
    return problems;
  }

  const toggleSeat = (id: number, code: string) => {
    alert = "";
    if (selection.some((seat) => seat.seatId === id)) {
      selection = selection.filter((seat) => seat.seatId !== id);
    } else if (selection.length >= maxSeats) {
      alert = `You can select up to ${maxSeats} seats per order.`;
    } else {
      selection = [...selection, { seatId: id, code, ticketType: defaultType() }];
    }
    render();
  };

  const hold = async () => {
    if (selection.length === 0 || holding) return;
    holding = true;
    alert = "";
    render();
    try {
      const holdResult = await holdSeats(
        session.id,
        selection.map((seat) => ({ seatId: seat.seatId, ticketType: seat.ticketType })),
      );
      holdId = holdResult.holdId;
      expiresAt = Date.parse(holdResult.expiresAt);
      selection = holdResult.seats.map((seat) => ({
        seatId: seat.seatId,
        code: seat.code,
        ticketType: seat.ticketType.slug,
      }));
      step = "checkout";
    } catch (error) {
      if (error instanceof ApiError && error.isConflict) {
        const lost = error.contested ?? [];
        alert = lost.length > 0 ? `These seats were just taken: ${lost.join(", ")}.` : "Some seats were just taken.";
        selection = selection.filter((seat) => !lost.includes(seat.code));
        await loadMap();
        return;
      }
      console.error("Could not hold seats", error);
      alert = error instanceof ApiError ? error.message : "Those seats could not be held.";
    } finally {
      holding = false;
      if (!signal.aborted) render();
    }
  };

  const pay = async () => {
    if (!holdId || paying || checkoutErrors().length > 0) return;
    paying = true;
    Object.keys(fieldErrors).forEach((key) => delete fieldErrors[key]);
    render();
    try {
      order = await createOrder({
        holdId,
        fullName: fields.fullName.trim(),
        email: fields.email.trim(),
        mobileNumber: fields.mobileNumber.replace(/\s+/g, ""),
        cardNumber: fields.cardNumber.replace(/\s+/g, ""),
        expiry: fields.expiry.trim(),
        cvv: fields.cvv.trim(),
      });
      holdId = null;
      step = "confirmed";
    } catch (error) {
      if (error instanceof ApiError && error.isValidationError && error.errors) {
        Object.entries(error.errors).forEach(([key, messages]) => {
          fieldErrors[key] = messages[0] ?? "Check this field";
        });
      } else if (error instanceof ApiError && error.isConflict) {
        alert = error.message;
        step = "seats";
        await loadMap();
        return;
      } else {
        console.error("Payment failed", error);
        alert = error instanceof ApiError ? error.message : "Payment could not be completed.";
      }
    } finally {
      paying = false;
      if (!signal.aborted) render();
    }
  };

  root.addEventListener("click", (event) => {
    const target = event.target as Element;
    if (target === root) {
      close();
      return;
    }
    const action = target.closest<HTMLElement>("[data-action]")?.dataset.action;
    const seat = target.closest<HTMLButtonElement>("[data-seat]:not([data-type]):not([data-remove])");
    const remove = target.closest<HTMLButtonElement>("[data-remove]");
    const typeButton = target.closest<HTMLButtonElement>("[data-type]");
    const stepButton = target.closest<HTMLButtonElement>("[data-step]");

    if (action === "close") close();
    else if (action === "hold") void hold();
    else if (action === "pay") void pay();
    else if (remove) {
      selection = selection.filter((item) => item.seatId !== Number(remove.dataset.remove));
      render();
    } else if (typeButton?.dataset.seat && typeButton.dataset.type) {
      selection = selection.map((item) =>
        item.seatId === Number(typeButton.dataset.seat)
          ? { ...item, ticketType: typeButton.dataset.type as TicketTypeSlug }
          : item,
      );
      render();
    } else if (seat?.dataset.seat) toggleSeat(Number(seat.dataset.seat), seat.dataset.code ?? "");
    else if (stepButton?.dataset.step === "seats") {
      step = "seats";
      render();
    } else if (stepButton?.dataset.step === "checkout" && holdId) {
      step = "checkout";
      render();
    }
  });

  root.addEventListener("input", (event) => {
    const input = event.target as HTMLInputElement;
    if (!(input instanceof HTMLInputElement) || !(input.name in fields)) return;
    let value = input.value;
    if (input.name === "cardNumber") value = value.replace(/[^\d]/g, "").slice(0, 16).replace(/(\d{4})(?=\d)/g, "$1 ");
    if (input.name === "expiry") {
      const digits = value.replace(/[^\d]/g, "").slice(0, 4);
      value = digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
    }
    if (input.name === "cvv") value = value.replace(/[^\d]/g, "").slice(0, 3);
    if (input.name === "mobileNumber") value = value.replace(/[^\d\s]/g, "").slice(0, 11);
    fields[input.name as keyof typeof fields] = value;
    delete fieldErrors[input.name];
    if (input.value !== value) input.value = value;
    const next = root.querySelector<HTMLButtonElement>("[data-action='pay']");
    if (next) next.disabled = checkoutErrors().length > 0 || paying;
    const check = input.parentElement?.querySelector(".booking__check");
    const valid = value.trim().length > 0 && !checkoutErrors().includes(input.name);
    if (valid && !check) input.insertAdjacentHTML("afterend", icon("check", "booking__check icon").value);
    if (!valid && check) check.remove();
  });

  root.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });

  signal.addEventListener("abort", close, { once: true });

  timerId = window.setInterval(() => {
    if (!holdId) return;
    paintTimer();
    if (secondsLeft() <= 0) expireHold();
  }, 1000);

  void loadMap();
}

function expiryValid(value: string): boolean {
  const match = /^(\d{2})\/(\d{2})$/.exec(value);
  if (!match) return false;
  const month = Number(match[1]);
  const year = 2000 + Number(match[2]);
  if (month < 1 || month > 12) return false;
  const end = new Date(year, month, 1);
  return end > new Date();
}
