import type { Page } from "../router/router";
import { html, toElement } from "../utils/dom";

export const ProfilePage: Page = () => {
  document.title = "Profile · Kino XII";

  return toElement(html`
    <section class="page">
      <h1 class="page__title">Profile</h1>
      <p class="page__placeholder">Personal information and My Tickets will appear here.</p>
    </section>
  `);
};
