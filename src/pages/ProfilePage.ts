import { getCurrentUser } from "../api/authApi";
import { updateProfile } from "../api/profileApi";
import { getFilterOptions } from "../api/sessionsApi";
import type { Page } from "../router/router";
import { appState, setUser } from "../state/appState";
import { requireAuth } from "../state/requireAuth";
import type { Venue } from "../types/venue";
import { html, toElement, type SafeHtml } from "../utils/dom";

function formatDateValue(value: string | null): string {
  return value ?? "";
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

function fieldMarkup({
  id,
  label,
  value,
  type = "text",
  required = false,
  disabled = false,
  options,
  error,
}: {
  id: string;
  label: string;
  value: string;
  type?: string;
  required?: boolean;
  disabled?: boolean;
  options?: Venue[];
  error?: string;
}): SafeHtml {
  const selectedValue = value ?? "";

  if (options) {
    return html`
      <label class="profile-form__field" for="${id}">
        <span class="profile-form__label">${label}${required ? " *" : ""}</span>
        <select id="${id}" name="${id}" ${disabled && "disabled"}>
          <option value="">Select venue</option>
          ${options.map(
            (venue) => html`<option value="${venue.id}" ${String(venue.id) === String(selectedValue) && "selected"}>${venue.name}</option>`,
          )}
        </select>
        ${error && html`<small class="profile-form__error">${error}</small>`}
      </label>
    `;
  }

  return html`
    <label class="profile-form__field" for="${id}">
      <span class="profile-form__label">${label}${required ? " *" : ""}</span>
      <input id="${id}" name="${id}" type="${type}" value="${value}" ${disabled && "disabled"} />
      ${error && html`<small class="profile-form__error">${error}</small>`}
    </label>
  `;
}

export const ProfilePage: Page = ({ signal }) => {
  document.title = "Profile · Kino XII";

  const page = toElement(html`
    <section class="page profile-page">
      <div class="profile-page__busy" aria-live="polite">Loading profile…</div>
    </section>
  `);

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
    const venues = filterOptions.venues;

    const initial = {
      fullName: current.fullName ?? "",
      email: current.email,
      mobileNumber: current.mobileNumber ?? "",
      dateOfBirth: formatDateValue(current.dateOfBirth),
      preferredVenueId: current.preferredVenue?.id ?? "",
    };

    const values = { ...initial };
    const errors: Record<string, string> = {};
    const form = toElement(html`
      <div class="profile-page__layout">
        <div class="profile-page__header">
          <div>
            <p class="profile-page__eyebrow">Account</p>
            <h1 class="page__title">My profile</h1>
          </div>
          <span class="profile-page__status ${current.profileComplete ? "profile-page__status--complete" : "profile-page__status--incomplete"}">
            ${current.profileComplete ? "Profile complete" : "Profile incomplete"}
          </span>
        </div>

        ${!current.profileComplete &&
        html`<p class="profile-page__banner" role="status">Please complete your profile to enable booking.</p>`}

        <form class="profile-form" novalidate>
          <div class="profile-form__grid">
            ${fieldMarkup({ id: "fullName", label: "Full name", value: values.fullName, required: true, error: errors.fullName })}
            ${fieldMarkup({ id: "email", label: "Email", value: values.email, type: "email", disabled: true })}
            ${fieldMarkup({ id: "mobileNumber", label: "Mobile number", value: values.mobileNumber, required: true, error: errors.mobileNumber })}
            ${fieldMarkup({ id: "dateOfBirth", label: "Date of birth", value: values.dateOfBirth, type: "date", required: true, error: errors.dateOfBirth })}
            ${fieldMarkup({ id: "preferredVenueId", label: "Preferred venue", value: String(values.preferredVenueId ?? ""), required: false, options: venues, error: errors.preferredVenueId })}
          </div>

          <div class="profile-form__actions">
            <button class="button button--primary" type="submit">Save changes</button>
          </div>
        </form>

        <section class="profile-page__tickets">
          <h2>My tickets</h2>
          <p class="page__placeholder">Ticket history and refund status will appear here after your first purchase.</p>
        </section>
      </div>
    `);

    const submitButton = form.querySelector<HTMLButtonElement>("button[type='submit']")!;
    const setFormState = () => {
      const inputs = form.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select");
      for (const input of inputs) {
        const key = input.name as keyof typeof values;
        if (key in values) {
          const typedValue = input instanceof HTMLSelectElement ? String(input.value) : input.value;
          values[key] = typedValue;
        }
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
        page.innerHTML = "";
        await renderProfile();
      } catch (error) {
        console.error("Profile update failed", error);
        const errorNode = form.querySelector(".profile-form__error");
        if (errorNode) errorNode.textContent = "Profile could not be saved. Please try again.";
        submitButton.disabled = false;
        submitButton.textContent = "Save changes";
      }
    });

    page.innerHTML = form.outerHTML;
  };

  void renderProfile();
  return page;
};
