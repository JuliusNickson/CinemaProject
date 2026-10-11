import { getCurrentUser } from "../api/authApi";
import { ApiError } from "../api/client";
import { updateProfile } from "../api/profileApi";
import { getFilterOptions } from "../api/sessionsApi";
import { getTickets, refundOrder } from "../api/ticketsApi";
import { AgeBadge } from "../components/Badge";
import { navigate, type Page } from "../router/router";
import { appState, isLoggedIn, setUser } from "../state/appState";
import { requireAuth } from "../state/requireAuth";
import type { Order } from "../types/ticket";
import type { Venue } from "../types/venue";
import { formatShortSessionDate } from "../utils/date";
import { html, toElement, type SafeHtml } from "../utils/dom";
import { formatLanguage, formatPrice } from "../utils/format";

function formatDateValue(value: string | null): string {
  return value ?? "";
}

/** Groups a digit-only number as `555 123 456`. Other characters are left for validation. */
function formatMobile(value: string): string {
  if (/[^\d\s]/.test(value)) return value;
  const digits = value.replace(/\D/g, "");
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`;
}

function ageFromDate(iso: string): number | null {
  if (!iso) return null;
  const birthDate = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(birthDate.getTime())) return null;
  const now = new Date();
  if (birthDate > now) return null;
  let age = now.getFullYear() - birthDate.getFullYear();
  const birthdayPassed =
    now.getMonth() > birthDate.getMonth() ||
    (now.getMonth() === birthDate.getMonth() && now.getDate() >= birthDate.getDate());
  if (!birthdayPassed) age -= 1;
  return age;
}

/** Shown under the date of birth. The saved age is what blocks 16+ and 18+ films. */
function agePurchaseNote(age: number): string {
  const rule = "Your age controls 16+ and 18+ purchases.";
  if (age < 16) return `You are ${age}. ${rule} You cannot buy tickets for 16+ or 18+ titles.`;
  if (age < 18) return `You are ${age}. ${rule} You cannot buy tickets for 18+ titles.`;
  return `You are ${age}. ${rule}`;
}

function mobileError(value: string): string | null {
  if (!value.trim()) return "Mobile number is required";
  if (/[^\d\s]/.test(value)) return "Please enter a valid Georgian mobile number (9 digits starting with 5)";
  const digits = value.replace(/\s+/g, "");
  if (!digits.startsWith("5")) return "Georgian mobile numbers must start with 5";
  if (digits.length !== 9) return "Mobile number must be exactly 9 digits";
  return null;
}

function validateProfile(values: Record<string, string | number | null>) {
  const errors: Record<string, string> = {};

  const fullName = String(values.fullName ?? "").trim();
  if (!fullName) errors.fullName = "Name is required";
  else if (fullName.length < 3) errors.fullName = "Name must be at least 3 characters";
  else if (fullName.length > 50) errors.fullName = "Name must not exceed 50 characters";

  const mobile = mobileError(String(values.mobileNumber ?? ""));
  if (mobile) errors.mobileNumber = mobile;

  const dateOfBirth = String(values.dateOfBirth ?? "");
  if (!dateOfBirth) errors.dateOfBirth = "Date of birth is required";
  else if (Number.isNaN(new Date(`${dateOfBirth}T00:00:00`).getTime()) || new Date(`${dateOfBirth}T00:00:00`) > new Date()) {
    errors.dateOfBirth = "Please enter a valid date of birth";
  } else {
    const age = ageFromDate(dateOfBirth);
    if (age !== null && age < 12) errors.dateOfBirth = "You must be at least 12 years old to create an account";
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

function ticketCard(order: Order, when: TicketWhen, refunding: boolean, error: string): SafeHtml {
  const { session } = order;
  const movie = session.movie;
  const reason = order.isRefundable ? "" : "Refunds close 2 hours before the session.";

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
        <small class="profile-form__error">${error ?? ""}</small>
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
      <small class="profile-form__error">${error ?? ""}</small>
    </label>
  `;
}

export const ProfilePage: Page = ({ query, signal, onQueryChange }) => {
  if (!isLoggedIn()) {
    const returnTo = `/profile${window.location.search}`;
    queueMicrotask(() => {
      navigate("/", { replace: true });
      requireAuth(() => navigate(returnTo));
    });
    return toElement(html`<section class="page profile-page"></section>`);
  }

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

  const renderProfile = async () => {
    const current = appState.get().user;
    if (!current) return;

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
    const serverErrors: Record<string, string> = {};
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
          ${current.profileComplete
            ? html`<p class="profile-page__status profile-page__status--complete" role="status">Profile Complete ✓</p>`
            : html`<p class="profile-page__banner" role="status">Please complete your profile to enable booking.</p>`}
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
            <p class="profile-form__age" data-age-note hidden></p>
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
    const touched = new Set<string>();
    const setFormState = (event?: Event) => {
      const target = event?.target;
      if (target instanceof HTMLElement && target.getAttribute("name")) {
        const name = target.getAttribute("name")!;
        touched.add(name);
        delete serverErrors[name];
      }
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
        const error = serverErrors[name] ?? (touched.has(name) ? validationErrors[name] : undefined);
        const field = input.closest(".profile-form__field");
        const errorNode = field?.querySelector(".profile-form__error");
        if (errorNode) errorNode.textContent = error ?? "";
        field?.classList.toggle("profile-form__field--invalid", Boolean(error));
      }

      const ageNote = form.querySelector<HTMLElement>("[data-age-note]");
      const age = ageFromDate(String(values.dateOfBirth ?? ""));
      const showAge = age !== null && age >= 12;
      if (ageNote) {
        ageNote.textContent = showAge ? agePurchaseNote(age) : "";
        ageNote.hidden = !showAge;
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
        for (const name of Object.keys(validationErrors)) touched.add(name);
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
        if (error instanceof ApiError && error.isUnauthorized) {
          submitButton.disabled = false;
          submitButton.textContent = "Save changes";
          requireAuth(() => form.requestSubmit());
          return;
        }
        if (error instanceof ApiError && error.isValidationError && error.errors) {
          const fieldsByKey: Record<string, string> = {
            fullName: "fullName",
            full_name: "fullName",
            mobileNumber: "mobileNumber",
            mobile_number: "mobileNumber",
            dateOfBirth: "dateOfBirth",
            date_of_birth: "dateOfBirth",
            preferredVenueId: "preferredVenueId",
            preferred_venue_id: "preferredVenueId",
          };
          Object.keys(serverErrors).forEach((key) => delete serverErrors[key]);
          Object.entries(error.errors).forEach(([key, messages]) => {
            const field = fieldsByKey[key] ?? key;
            serverErrors[field] = messages[0] ?? "Check this field";
            touched.add(field);
          });
          setFormState();
        } else {
          const status = layout.querySelector(".profile-page__banner, .profile-page__status");
          if (status) status.textContent = error instanceof ApiError ? error.message : "Profile could not be saved. Please try again.";
        }
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
        <div class="ticket-list__message">
          <p class="text-body-m text-secondary">
            ${when === "past" ? "No past tickets." : "No upcoming tickets."}
          </p>
          ${when === "upcoming" && html`<a class="button button--tint" href="/sessions">Browse sessions</a>`}
        </div>
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
    let unauthorized = false;
    try {
      orders = await getTickets(undefined, signal);
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof ApiError && error.isUnauthorized) {
        unauthorized = true;
        requireAuth(() => void loadTickets());
        return;
      }
      console.error("Tickets could not be loaded", error);
      ticketsError = true;
      orders = null;
    } finally {
      ticketsLoading = false;
      if (!unauthorized && !signal.aborted) {
        paintCounts();
        paintTickets();
      }
    }
  };

  const refund = async (reference: string) => {
    if (refunding.has(reference)) return;
    if (!window.confirm("Refund this order? This cannot be undone.")) return;
    refunding.add(reference);
    refundErrors.delete(reference);
    paintTickets();
    try {
      const updated = await refundOrder(reference);
      orders = (orders ?? []).map((order) => (order.reference === reference ? updated : order));
    } catch (error) {
      if (error instanceof ApiError && error.isUnauthorized) {
        requireAuth(() => void refund(reference));
        return;
      }
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
