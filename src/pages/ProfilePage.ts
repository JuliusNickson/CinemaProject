import { getCurrentUser } from "../api/authApi";
import { ApiError } from "../api/client";
import { updateProfile } from "../api/profileApi";
import { getFilterOptions } from "../api/sessionsApi";
import { getTickets, refundOrder } from "../api/ticketsApi";
import { AgeBadge } from "../components/Badge";
import { navigate, type Page } from "../router/router";
import { appState, setUser } from "../state/appState";
import { requireAuth } from "../state/requireAuth";
import type { Order } from "../types/ticket";
import type { Venue } from "../types/venue";
import { formatShortSessionDate } from "../utils/date";
import { html, toElement, type SafeHtml } from "../utils/dom";
import { formatLanguage, formatPrice } from "../utils/format";

function formatDateValue(value: string | null): string {
  return value ?? "";
}

/** `555123456` → `555 123 456`, matching the profile form. */
function formatMobile(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 9);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
}

function validateProfile(values: Record<string, string | number | null>) {
  const errors: Record<string, string> = {};

  const fullName = String(values.fullName ?? "").trim();
  if (!fullName) errors.fullName = "Name is required";
  else if (fullName.length < 3) errors.fullName = "Name must be at least 3 characters";
  else if (fullName.length > 50) errors.fullName = "Name must not exceed 50 characters";

  const mobileNumber = String(values.mobileNumber ?? "").replace(/\s+/g, "");
  if (!mobileNumber) errors.mobileNumber = "Mobile number is required";
  else if (!/^5\d{8}$/.test(mobileNumber)) errors.mobileNumber = "Please enter a valid Georgian mobile number (9 digits starting with 5)";

  const dateOfBirth = String(values.dateOfBirth ?? "");
  if (!dateOfBirth) errors.dateOfBirth = "Date of birth is required";
  else {
    const birthDate = new Date(`${dateOfBirth}T00:00:00`);
    const now = new Date();
    if (Number.isNaN(birthDate.getTime())) errors.dateOfBirth = "Please enter a valid date of birth";
    else if (birthDate > now) errors.dateOfBirth = "Please enter a valid date of birth";
    else {
      const age = now.getFullYear() - birthDate.getFullYear();
      const hasBirthdayPassed =
        now.getMonth() > birthDate.getMonth() ||
        (now.getMonth() === birthDate.getMonth() && now.getDate() >= birthDate.getDate());
      const calculatedAge = hasBirthdayPassed ? age : age - 1;
      if (calculatedAge < 12) errors.dateOfBirth = "You must be at least 12 years old to create an account";
    }
  }

  return errors;
}

type ProfileTab = "info" | "tickets";
type TicketWhen = "upcoming" | "past";

function readTab(params: URLSearchParams): ProfileTab {
  return params.get("tab") === "tickets" ? "tickets" : "info";
}

function readWhen(params: URLSearchParams): TicketWhen {
  return params.get("when") === "past" ? "past" : "upcoming";
}

function profileUrl(tab: ProfileTab, when: TicketWhen = "upcoming"): string {
  if (tab === "info") return "/profile";
  return when === "past" ? "/profile?tab=tickets&when=past" : "/profile?tab=tickets";
}

/** Refunded orders leave Upcoming even if the API still marks them upcoming. */
function isPastOrder(order: Order): boolean {
  return !order.isUpcoming || order.status === "refunded";
}

/** Display only. The button follows `order.isRefundable` from the API. */
function refundUntil(startsAt: string): string {
  const cutoff = new Date(new Date(startsAt).getTime() - 2 * 60 * 60 * 1000);
  if (Number.isNaN(cutoff.getTime())) return "";
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(cutoff);
  const day = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(cutoff);
  return `${time}, ${day}`;
}

function ticketCard(order: Order, when: TicketWhen, refunding: boolean, error: string): SafeHtml {
  const { session } = order;
  const movie = session.movie;
  const until = refundUntil(session.startsAt);
  const reason = order.isRefundable
    ? until && `Refundable until ${until}`
    : "Refunds close 2 hours before the session.";

  return html`
    <article class="ticket-card">
      <div class="ticket-card__poster">
        ${movie?.posterUrl && html`<img src="${movie.posterUrl}" alt="" />`}
      </div>
      <div class="ticket-card__main">
        <div class="ticket-card__title">
          <h3 class="text-button">${(movie?.title ?? "Ticket").toUpperCase()}</h3>
          ${movie && AgeBadge(movie.ageRating.code)}
          ${movie && html`<span class="text-body-s text-secondary">${movie.runtimeMinutes} min</span>`}
        </div>
        <div class="ticket-card__facts">
          <p>
            <span class="ticket-card__label text-label-s">Date</span>
            <span class="text-label-m">${formatShortSessionDate(session.date)} · ${session.time}</span>
          </p>
          <p>
            <span class="ticket-card__label text-label-s">Venue</span>
            <span class="text-label-m">${session.venue.name} · Hall ${session.hall.name}</span>
          </p>
          <p>
            <span class="ticket-card__label text-label-s">Format</span>
            <span class="text-label-m">${session.format.name} · ${formatLanguage(session.language)}</span>
          </p>
        </div>
        <div class="ticket-card__seats">
          <span class="ticket-card__label text-label-s">Seats</span>
          <span class="ticket-card__pills">
            ${order.tickets.map(
              (ticket) => html`<span class="ticket-card__pill text-label-s">${ticket.seatCode} · ${ticket.ticketType.name}</span>`,
            )}
          </span>
        </div>
      </div>
      <div class="ticket-card__aside">
        <p class="ticket-card__order">
          <span class="ticket-card__label text-label-s">Order</span>
          <span class="text-label-m">#${order.reference}</span>
        </p>
        <p class="ticket-card__paid">
          <span class="ticket-card__label text-label-s">Total paid</span>
          <span class="text-h3">${formatPrice(order.totalPrice, { spaced: false })}</span>
        </p>
        ${when === "upcoming"
          ? html`
              <button
                class="button ticket-card__refund"
                type="button"
                data-refund="${order.reference}"
                ${(refunding || !order.isRefundable) && "disabled"}
              >
                ${refunding ? "Refunding…" : "Refund"}
              </button>
              ${reason && html`<p class="ticket-card__hint text-body-s" id="refund-${order.reference}">${reason}</p>`}
              ${error && html`<p class="ticket-card__error text-body-s">${error}</p>`}
            `
          : order.status === "refunded" && html`<p class="ticket-card__refunded text-label-s">Refunded</p>`}
      </div>
    </article>
  `;
}

function fieldMarkup({
  id,
  label,
  value,
  type = "text",
  disabled = false,
  placeholder = "",
  hint = "",
  options,
  error,
}: {
  id: string;
  label: string;
  value: string;
  type?: string;
  disabled?: boolean;
  placeholder?: string;
  hint?: string;
  options?: Venue[];
  error?: string;
}): SafeHtml {
  const selectedValue = value ?? "";

  if (options) {
    return html`
      <label class="profile-form__field" for="${id}">
        <span class="profile-form__label">${label}</span>
        <select id="${id}" name="${id}" ${disabled && "disabled"}>
          <option value="">e.g. Text</option>
          ${options.map(
            (venue) => html`<option value="${venue.id}" ${String(venue.id) === String(selectedValue) && "selected"}>${venue.name}</option>`,
          )}
        </select>
        ${error && html`<small class="profile-form__error">${error}</small>`}
      </label>
    `;
  }

  const date = type === "date";

  return html`
    <label class="profile-form__field" for="${id}">
      <span class="profile-form__label">${label}</span>
      ${date
        ? html`
            <span class="profile-form__date ${!value && "profile-form__date--empty"}">
              <input id="${id}" name="${id}" type="date" value="${value}" ${disabled && "disabled"} />
              <button class="profile-form__calendar" type="button" aria-label="Choose date"></button>
            </span>
          `
        : html`<input id="${id}" name="${id}" type="${type}" value="${value}" placeholder="${placeholder}" ${disabled && "disabled"} />`}
      ${hint && html`<span class="profile-form__hint">${hint}</span>`}
      ${error && html`<small class="profile-form__error">${error}</small>`}
    </label>
  `;
}

export const ProfilePage: Page = ({ query, signal, onQueryChange }) => {
  document.title = readTab(query) === "tickets" ? "My tickets · Kino XII" : "Profile · Kino XII";

  const page = toElement(html`
    <section class="page profile-page">
      <div class="profile-page__busy" aria-live="polite">Loading profile…</div>
    </section>
  `);

  let orders: Order[] | null = null;
  let ticketsLoading = false;
  let ticketsError = false;
  const refunding = new Set<string>();
  const refundErrors = new Map<string, string>();

  const upcomingOrders = () => (orders ?? []).filter((order) => !isPastOrder(order));
  const pastOrders = () => (orders ?? []).filter(isPastOrder);

  const renderGuestState = () => {
    page.innerHTML = html`
      <section class="page profile-page">
        <div class="profile-page__notice">
          <h1 class="page__title">Profile</h1>
          <p class="page__placeholder">Please sign in to view and update your profile.</p>
        </div>
      </section>
    `.value;
  };

  const renderProfile = async () => {
    const current = appState.get().user;
    if (!current) {
      renderGuestState();
      requireAuth(() => {
        void renderProfile();
      });
      return;
    }

    const filterOptions = appState.get().filterOptions ?? (await getFilterOptions(signal));
    if (signal.aborted) return;
    const venues = filterOptions.venues;

    const initial = {
      fullName: current.fullName ?? "",
      email: current.email,
      mobileNumber: formatMobile(current.mobileNumber ?? ""),
      dateOfBirth: formatDateValue(current.dateOfBirth),
      preferredVenueId: current.preferredVenue?.id ?? "",
    };

    const values = { ...initial };
    const errors: Record<string, string> = {};
    const initialTab = readTab(query);
    const initialWhen = readWhen(query);
    const layout = toElement(html`
      <div class="profile-page__layout">
        <h1 class="profile-page__title">My Profile</h1>
        <div class="profile-tabs" role="tablist">
          <button
            class="profile-tabs__tab text-label-m ${initialTab === "info" && "profile-tabs__tab--active"}"
            type="button"
            role="tab"
            data-profile-tab="info"
            aria-selected="${initialTab === "info"}"
          >
            Personal Information
          </button>
          <button
            class="profile-tabs__tab text-label-m ${initialTab === "tickets" && "profile-tabs__tab--active"}"
            type="button"
            role="tab"
            data-profile-tab="tickets"
            aria-selected="${initialTab === "tickets"}"
          >
            My Tickets
            <span class="profile-tabs__count" data-ticket-count hidden></span>
          </button>
        </div>

        <div class="profile-panel" data-panel="info" ${initialTab !== "info" && "hidden"}>
          ${!current.profileComplete &&
          html`<p class="profile-page__banner" role="status">Please complete your profile to enable booking.</p>`}
        <form class="profile-form" novalidate>
          <div class="profile-form__grid">
            ${fieldMarkup({ id: "fullName", label: "Full name", value: values.fullName, placeholder: "e.g. Text", error: errors.fullName })}
            ${fieldMarkup({
              id: "email",
              label: "Email",
              value: values.email,
              type: "email",
              disabled: true,
              hint: "Set at registration and cannot be changed",
            })}
            ${fieldMarkup({ id: "mobileNumber", label: "Mobile number", value: values.mobileNumber, placeholder: "e.g. Text", error: errors.mobileNumber })}
            ${fieldMarkup({ id: "dateOfBirth", label: "Date of birth", value: values.dateOfBirth, type: "date", error: errors.dateOfBirth })}
            ${fieldMarkup({
              id: "preferredVenueId",
              label: "Preferred Venue (Optional)",
              value: String(values.preferredVenueId ?? ""),
              options: venues,
              error: errors.preferredVenueId,
            })}
          </div>

          <div class="profile-form__actions">
            <button class="button button--primary" type="submit">Save changes</button>
          </div>
        </form>
        </div>

        <section class="profile-panel profile-tickets" data-panel="tickets" ${initialTab !== "tickets" && "hidden"}>
          <div class="ticket-filters" role="tablist" aria-label="Ticket history">
            <button
              class="ticket-filters__tab text-label-m ${initialWhen === "upcoming" && "ticket-filters__tab--active"}"
              type="button"
              role="tab"
              data-ticket-when="upcoming"
              aria-selected="${initialWhen === "upcoming"}"
            >
              Upcoming <span data-upcoming-count>0</span>
            </button>
            <button
              class="ticket-filters__tab text-label-m ${initialWhen === "past" && "ticket-filters__tab--active"}"
              type="button"
              role="tab"
              data-ticket-when="past"
              aria-selected="${initialWhen === "past"}"
            >
              Past <span data-past-count>0</span>
            </button>
          </div>
          <div class="ticket-list" data-ticket-list></div>
        </section>
      </div>
    `);

    const form = layout.querySelector<HTMLFormElement>("form")!;
    const submitButton = form.querySelector<HTMLButtonElement>("button[type='submit']")!;
    const setFormState = () => {
      const inputs = form.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select");
      for (const input of inputs) {
        const key = input.name as keyof typeof values;
        if (!(key in values)) continue;
        if (input instanceof HTMLInputElement && input.name === "mobileNumber") {
          const formatted = formatMobile(input.value);
          if (input.value !== formatted) input.value = formatted;
          values.mobileNumber = formatted;
          continue;
        }
        values[key] = input instanceof HTMLSelectElement ? String(input.value) : input.value;
        input.closest(".profile-form__date")?.classList.toggle("profile-form__date--empty", input.value === "");
      }

      const validationErrors = validateProfile(values);
      Object.assign(errors, validationErrors);

      for (const input of inputs) {
        const name = input.name;
        const error = validationErrors[name];
        const field = input.closest(".profile-form__field");
        const errorNode = field?.querySelector(".profile-form__error");
        if (errorNode) errorNode.textContent = error ?? "";
        field?.classList.toggle("profile-form__field--invalid", Boolean(error));
      }

      const isDirty =
        values.fullName !== initial.fullName ||
        values.mobileNumber !== initial.mobileNumber ||
        values.dateOfBirth !== initial.dateOfBirth ||
        values.preferredVenueId !== initial.preferredVenueId;

      submitButton.disabled = !isDirty || Object.keys(validationErrors).length > 0;
    };

    form.querySelectorAll("input, select").forEach((input) => {
      input.addEventListener("input", setFormState);
      input.addEventListener("change", setFormState);
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const validationErrors = validateProfile(values);
      if (Object.keys(validationErrors).length > 0) {
        setFormState();
        return;
      }

      submitButton.disabled = true;
      submitButton.textContent = "Saving…";

      try {
        const nextUser = await updateProfile({
          fullName: String(values.fullName ?? "").trim(),
          mobileNumber: String(values.mobileNumber ?? "").replace(/\s+/g, ""),
          dateOfBirth: String(values.dateOfBirth ?? ""),
          preferredVenueId: values.preferredVenueId ? Number(values.preferredVenueId) : null,
        });

        setUser(nextUser);
        const refreshed = await getCurrentUser(signal);
        setUser(refreshed);
        page.replaceChildren();
        await renderProfile();
      } catch (error) {
        console.error("Profile update failed", error);
        const errorNode = form.querySelector(".profile-form__error");
        if (errorNode) errorNode.textContent = "Profile could not be saved. Please try again.";
        submitButton.disabled = false;
        submitButton.textContent = "Save changes";
      }
    });

    setFormState();
    page.replaceChildren(layout);
    applyView(new URLSearchParams(window.location.search));
    void loadTickets();
  };

  const paintCounts = () => {
    const upcoming = upcomingOrders().length;
    const past = pastOrders().length;
    const badge = page.querySelector<HTMLElement>("[data-ticket-count]");
    const upcomingCount = page.querySelector<HTMLElement>("[data-upcoming-count]");
    const pastCount = page.querySelector<HTMLElement>("[data-past-count]");
    if (badge) {
      badge.hidden = orders === null || upcoming === 0;
      badge.textContent = String(upcoming);
    }
    if (upcomingCount) upcomingCount.textContent = String(upcoming);
    if (pastCount) pastCount.textContent = String(past);
  };

  const paintTickets = () => {
    const list = page.querySelector<HTMLElement>("[data-ticket-list]");
    if (!list) return;
    const when = readWhen(new URLSearchParams(window.location.search));
    if (ticketsLoading && orders === null) {
      list.innerHTML = html`<p class="ticket-list__message text-body-m text-secondary">Loading tickets…</p>`.value;
      return;
    }
    if (ticketsError) {
      list.innerHTML = html`
        <div class="ticket-list__message">
          <p class="text-body-m text-secondary">Tickets could not be loaded.</p>
          <button class="button button--tint" type="button" data-action="retry-tickets">Try again</button>
        </div>
      `.value;
      return;
    }

    const visible = when === "past" ? pastOrders() : upcomingOrders();
    if (visible.length === 0) {
      list.innerHTML = html`
        <p class="ticket-list__message text-body-m text-secondary">
          ${when === "past" ? "No past tickets." : "No upcoming tickets."}
        </p>
      `.value;
      return;
    }

    list.innerHTML = visible
      .map((order) => ticketCard(order, when, refunding.has(order.reference), refundErrors.get(order.reference) ?? "").value)
      .join("");
  };

  const applyView = (params: URLSearchParams) => {
    const tab = readTab(params);
    const when = readWhen(params);
    page.querySelector<HTMLElement>("[data-panel='info']")?.toggleAttribute("hidden", tab !== "info");
    page.querySelector<HTMLElement>("[data-panel='tickets']")?.toggleAttribute("hidden", tab !== "tickets");
    page.querySelectorAll<HTMLButtonElement>("[data-profile-tab]").forEach((button) => {
      const active = button.dataset.profileTab === tab;
      button.classList.toggle("profile-tabs__tab--active", active);
      button.setAttribute("aria-selected", String(active));
    });
    page.querySelectorAll<HTMLButtonElement>("[data-ticket-when]").forEach((button) => {
      const active = button.dataset.ticketWhen === when;
      button.classList.toggle("ticket-filters__tab--active", active);
      button.setAttribute("aria-selected", String(active));
    });
    document.title = tab === "tickets" ? "My tickets · Kino XII" : "Profile · Kino XII";
    paintTickets();
  };

  const loadTickets = async () => {
    ticketsLoading = true;
    ticketsError = false;
    paintTickets();
    try {
      orders = await getTickets(undefined, signal);
    } catch (error) {
      if (signal.aborted) return;
      console.error("Tickets could not be loaded", error);
      ticketsError = true;
      orders = null;
    } finally {
      ticketsLoading = false;
      if (!signal.aborted) {
        paintCounts();
        paintTickets();
      }
    }
  };

  const refund = async (reference: string) => {
    if (refunding.has(reference)) return;
    refunding.add(reference);
    refundErrors.delete(reference);
    paintTickets();
    try {
      const updated = await refundOrder(reference);
      orders = (orders ?? []).map((order) =>
        order.reference === reference ? { ...updated, status: "refunded", isUpcoming: false } : order,
      );
    } catch (error) {
      console.error("Refund failed", error);
      refundErrors.set(reference, error instanceof ApiError ? error.message : "This ticket could not be refunded.");
    } finally {
      refunding.delete(reference);
      if (!signal.aborted) {
        paintCounts();
        paintTickets();
      }
    }
  };

  page.addEventListener(
    "click",
    (event) => {
      const target = event.target as Element;
      const calendar = target.closest<HTMLButtonElement>(".profile-form__calendar");
      if (calendar) {
        event.preventDefault();
        const input = calendar.parentElement?.querySelector<HTMLInputElement>("input");
        input?.focus();
        try {
          input?.showPicker();
        } catch {
          /* The picker is already open, or this browser has no showPicker. */
        }
        return;
      }
      const tab = target.closest<HTMLButtonElement>("[data-profile-tab]")?.dataset.profileTab;
      const when = target.closest<HTMLButtonElement>("[data-ticket-when]")?.dataset.ticketWhen;
      const reference = target.closest<HTMLButtonElement>("[data-refund]")?.dataset.refund;
      const action = target.closest<HTMLButtonElement>("[data-action]")?.dataset.action;

      if (tab === "info") navigate(profileUrl("info"));
      else if (tab === "tickets") navigate(profileUrl("tickets", readWhen(new URLSearchParams(window.location.search))));
      else if (when === "upcoming" || when === "past") navigate(profileUrl("tickets", when));
      else if (reference) void refund(reference);
      else if (action === "retry-tickets") void loadTickets();
    },
    { signal },
  );

  onQueryChange(applyView);

  void renderProfile();
  return page;
};
