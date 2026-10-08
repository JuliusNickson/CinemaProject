import type { Page } from "../router/router";
import { html, toElement } from "../utils/dom";

export const SessionsPage: Page = () => {
  document.title = "Sessions · Kino XII";

  return toElement(html`
    <section class="page">
      <h1 class="page__title">Sessions</h1>
      <p class="page__placeholder">Filters and the sessions list will appear here.</p>
    </section>
  `);
};
