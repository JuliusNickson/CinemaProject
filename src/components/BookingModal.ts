import { ApiError, failureText } from "../api/client";
import { forgetHold, getSeatMap, getSession, holdSeats, releaseHold, rememberHold } from "../api/sessionsApi";
import { createOrder } from "../api/ticketsApi";
import { navigate } from "../router/router";
import { appState } from "../state/appState";
import { requireAuth } from "../state/requireAuth";
import type { Movie } from "../types/movie";
import type { Seat, SeatHold, SeatMap, SeatState } from "../types/seat";
import type { Session } from "../types/session";
import type { Order, TicketType, TicketTypeSlug } from "../types/ticket";
import { formatSessionDate, formatShortSessionDate, hasStarted } from "../utils/date";
import { html, toElement, type SafeHtml } from "../utils/dom";
import { formatLanguage, formatPrice } from "../utils/format";
import { icon } from "./icons";

export interface BookingOptions {
  movie: Movie;
  session: Session;
  signal: AbortSignal;
  /** A live hold restored after reload. Opens on checkout. */
  resume?: SeatHold;
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

export function openBooking({ movie, session, signal, resume }: BookingOptions): void {
  if (document.querySelector(".booking")) return;
  if (!resume && hasStarted(session.startsAt)) return;

  const options = appState.get().filterOptions;
  const typeOrder = ["child", "student", "adult"];
  const ticketTypes = [...(options?.ticketTypes ?? [])].sort(
    (a, b) => typeOrder.indexOf(a.slug) - typeOrder.indexOf(b.slug),
  );
  const maxSeats = options?.maxSeatsPerOrder ?? 3;
  const user = appState.get().user;
  let shownSession = session;

  const root = toElement(html`<div class="booking" role="presentation"></div>`);
  const previousOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  document.body.append(root);

  let step: Step = resume?.isLive ? "checkout" : "seats";
  let seatMap: SeatMap | null = null;
  let loadError = "";
  let alert = "";
  let selection: Selection[] = resume?.isLive
    ? resume.seats.map((seat) => ({ seatId: seat.seatId, code: seat.code, ticketType: seat.ticketType.slug }))
    : [];
  let holdId: string | null = resume?.isLive ? resume.holdId : null;
  let expiresAt = resume?.isLive ? Date.parse(resume.expiresAt) : 0;
  let heldSubtotal: number | null = resume?.isLive ? resume.subtotal : null;
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

  const priceOf = (slug: TicketTypeSlug) => ticketPrice(shownSession.price, typeBySlug(slug)?.priceRatio ?? 1);

  const subtotal = () => selection.reduce((sum, seat) => sum + priceOf(seat.ticketType), 0);

  const secondsLeft = () => (expiresAt ? Math.ceil((expiresAt - Date.now()) / 1000) : 0);

  const close = () => {
    window.clearInterval(timerId);
    if (holdId && step !== "confirmed") {
      void releaseHold(holdId).catch(() => undefined);
      forgetHold();
    }
    document.body.style.overflow = previousOverflow;
    root.remove();
  };

  const paintTimer = () => {
    const node = root.querySelector<HTMLElement>("[data-timer]");
    if (node) node.textContent = formatClock(secondsLeft());
  };

  const expireHold = (message = "Your hold time expired. Please re-select your seats.") => {
    const expired = holdId;
    holdId = null;
    expiresAt = 0;
    heldSubtotal = null;
    selection = [];
    step = "seats";
    alert = message;
    forgetHold();
    if (expired) void releaseHold(expired).catch(() => undefined);
    void loadMap();
  };

  const render = () => {
    root.innerHTML = dialogMarkup().value;
    paintTimer();
  };

  const markSold = (codes: string[]) => {
    if (!seatMap || codes.length === 0) return;
    const lost = new Set(codes);
    seatMap.sections.forEach((section) => {
      section.rows.forEach((row) => {
        row.seats.forEach((seat) => {
          if (lost.has(seat.code)) seat.state = "sold";
        });
      });
    });
  };

  const loadMap = async (paint = true) => {
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
      loadError = failureText(error, "The seat map could not be loaded.");
    }
    if (!signal.aborted && paint) render();
  };

  /** Child tickets on a 16+ or 18+ film block checkout and name the seat. */
  const seatRuleViolations = (): string[] =>
    selection.flatMap((seat) => {
      const type = typeBySlug(seat.ticketType);
      if (!type || !blocked(type)) return [];
      const reason = type.note ?? `${type.name} tickets are not available for this film.`;
      return [`Seat ${seat.code}: ${reason}`];
    });

  function seatButton(seat: Seat): SafeHtml {
    if (seat.state === "unavailable") {
      return html`<span class="booking__gap"></span>${seat.aisleAfter && html`<span class="booking__aisle"></span>`}`;
    }

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
    if (loadError) {
      return html`
        <div class="booking__alert">
          <p>${loadError}</p>
          <button class="button button--tint" type="button" data-action="retry-map">Try again</button>
        </div>
      `;
    }
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
              <span class="text-label-m">Seat <strong>${seat.code}</strong> · ${type?.name ?? "Adult"}</span>
              <span class="booking-pick__price text-label-m">${formatPrice(priceOf(seat.ticketType))}</span>
              <button class="booking-pick__remove" type="button" data-remove="${seat.seatId}" aria-label="Remove seat ${seat.code}">×</button>
            </div>
            <div class="booking-pick__types">
              ${ticketTypes.filter((option) => !blocked(option)).map((option) => {
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
    return html`
      <aside class="booking__summary">
        <h3 class="text-button">Summary</h3>
        <div class="booking-order">
          <div>
            <p class="text-button">${movie.title.toUpperCase()}</p>
            <p class="booking-order__place text-body-s">Hall ${shownSession.hall.name} · ${formatShortSessionDate(shownSession.date)} · ${shownSession.time}</p>
          </div>
          <div class="booking-order__row text-body-s"><span>Seats</span><strong>${selection.map((seat) => seat.code).join(", ")}</strong></div>
          <div class="booking-order__row text-body-s"><span>Tickets</span><strong>${countTickets(held, ticketTypes)}</strong></div>
        </div>
        <div class="booking__total">
          <span class="text-label-s">SUBTOTAL</span>
          <span class="text-h1">${formatPrice(heldSubtotal ?? subtotal())}</span>
        </div>
        <button class="button button--primary booking__next" type="button" data-action="pay" ${(!contactReady() || paying) && "disabled"}>
          ${paying ? "Processing…" : "Pay & Complete Order"}
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
              <p class="text-body-s text-secondary">${sessionLine(shownSession)}</p>
            </div>
          </div>
          <div class="booking__ticket-row text-body-s"><span>Seats</span><strong>${order.tickets.map((ticket) => ticket.seatCode).join(", ")}</strong></div>
          <div class="booking__ticket-row text-body-s"><span>Tickets</span><strong>${grouped}</strong></div>
          <div class="booking__ticket-row text-body-s"><span>TOTAL PAID</span><strong class="text-h3">${formatPrice(order.totalPrice)}</strong></div>
        </div>
        <div class="booking__actions">
          <a class="button button--primary" href="/profile?tab=tickets">My Tickets</a>
          <button class="button button--tint" type="button" data-action="close">Close</button>
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
              <p class="booking__meta text-body-s">${sessionLine(shownSession, true)}</p>
            </div>
            <div class="booking__header-side">
              ${holdId &&
              html`
                <div class="booking__timer">
                  <span class="booking__timer-label text-label-s">SEATS HELD</span>
                  <span class="text-button" data-timer>${formatClock(secondsLeft())}</span>
                </div>
              `}
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
                    ${selection.length === 0 &&
                    html`<p class="booking__hint text-body-s">Pick up to ${maxSeats} seats from the map. Each seat can carry its own ticket type.</p>`}
                    ${picksMarkup()}
                    <div class="booking__total">
                      <span class="text-label-s">SUBTOTAL</span>
                      <span class="text-h1">${formatPrice(subtotal())}</span>
                    </div>
                    ${seatRuleViolations().length > 0 &&
                    html`<p class="booking__alert text-body-s">${seatRuleViolations().join(" ")}</p>`}
                    <button
                      class="button button--primary booking__next"
                      type="button"
                      data-action="hold"
                      ${(selection.length === 0 || holding || seatRuleViolations().length > 0) && "disabled"}
                    >
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

  const FIELD_MESSAGES: Record<string, string> = {
    fullName: "Name must be at least 3 characters",
    email: "Enter a valid email",
    mobileNumber: "Enter a Georgian mobile number",
    cardNumber: "Card number must be 16 digits",
    expiry: "Use a future MM/YY date",
    cvv: "CVV must be 3 digits",
  };

  function contactProblems(): string[] {
    const problems: string[] = [];
    const mobile = fields.mobileNumber.replace(/\s+/g, "");
    if (fields.fullName.trim().length < 3) problems.push("fullName");
    if (!EMAIL_PATTERN.test(fields.email.trim())) problems.push("email");
    if (!/^5\d{8}$/.test(mobile)) problems.push("mobileNumber");
    return problems;
  }

  function checkoutErrors(): string[] {
    const card = fields.cardNumber.replace(/\s+/g, "");
    const problems = contactProblems();
    if (!/^\d{16}$/.test(card)) problems.push("cardNumber");
    if (!expiryValid(fields.expiry.trim())) problems.push("expiry");
    if (!/^\d{3}$/.test(fields.cvv.trim())) problems.push("cvv");
    return problems;
  }

  const contactReady = () => contactProblems().length === 0;

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

  const dropContested = async (codes: string[]) => {
    holdId = null;
    expiresAt = 0;
    heldSubtotal = null;
    forgetHold();
    alert = codes.length > 0 ? `These seats were just taken: ${codes.join(", ")}.` : "Some seats were just taken.";
    selection = selection.filter((seat) => !codes.includes(seat.code));
    step = "seats";
    await loadMap(false);
    markSold(codes);
  };

  const hold = async () => {
    if (selection.length === 0 || holding || seatRuleViolations().length > 0) return;
    const currentUser = appState.get().user;
    if (!currentUser?.profileComplete) {
      close();
      navigate("/profile");
      return;
    }
    if (currentUser.age !== null && movie.ageRating.minAge > currentUser.age) {
      alert = `This film is rated ${movie.ageRating.code}. You cannot buy tickets for it with this account.`;
      render();
      return;
    }

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
      heldSubtotal = holdResult.subtotal;
      selection = holdResult.seats.map((seat) => ({
        seatId: seat.seatId,
        code: seat.code,
        ticketType: seat.ticketType.slug,
      }));
      rememberHold({ holdId: holdResult.holdId, sessionId: session.id, movieSlug: movie.slug });
      step = "checkout";
    } catch (error) {
      if (error instanceof ApiError && error.isUnauthorized) {
        requireAuth(() => void hold());
        return;
      }
      if (error instanceof ApiError && error.isConflict) {
        await dropContested(error.contested ?? []);
        return;
      }
      if (error instanceof ApiError && error.isRuleViolation && !appState.get().user?.profileComplete) {
        close();
        navigate("/profile");
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
    if (!holdId || paying) return;
    const problems = checkoutErrors();
    Object.keys(fieldErrors).forEach((key) => delete fieldErrors[key]);
    if (problems.length > 0) {
      problems.forEach((key) => {
        fieldErrors[key] = FIELD_MESSAGES[key];
      });
      render();
      return;
    }
    paying = true;
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
      forgetHold();
      step = "confirmed";
    } catch (error) {
      if (error instanceof ApiError && error.isUnauthorized) {
        requireAuth(() => void pay());
        return;
      }
      if (error instanceof ApiError && error.isValidationError && error.errors) {
        const fieldsByKey: Record<string, keyof typeof fields> = {
          fullName: "fullName",
          full_name: "fullName",
          email: "email",
          mobileNumber: "mobileNumber",
          mobile_number: "mobileNumber",
          cardNumber: "cardNumber",
          card_number: "cardNumber",
          expiry: "expiry",
          cvv: "cvv",
        };
        Object.entries(error.errors).forEach(([key, messages]) => {
          const field = fieldsByKey[key];
          const message = messages[0] ?? "Check this field";
          if (field) fieldErrors[field] = message;
          else alert = message;
        });
      } else if (error instanceof ApiError && error.isConflict) {
        await dropContested(error.contested ?? []);
      } else if (error instanceof ApiError && error.isRuleViolation) {
        expireHold(error.message);
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

    if (action === "retry-map") void loadMap();
    else if (action === "close") close();
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
    if (next) next.disabled = !contactReady() || paying;
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

  void getSession(session.id, signal)
    .then((fresh) => {
      shownSession = fresh;
      if (!signal.aborted && root.isConnected) render();
    })
    .catch(() => undefined);

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
