import type { Page } from "../router/router";
import { html, toElement } from "../utils/dom";

export const MovieDetailsPage: Page = ({ params }) => {
  document.title = "Film · Kino XII";

  return toElement(html`
    <section class="page">
      <h1 class="page__title">Film details</h1>
      <p class="page__placeholder">Details for <code>${params.slug}</code> will appear here.</p>
    </section>
  `);
};
