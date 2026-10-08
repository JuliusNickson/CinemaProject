import type { Page } from "../router/router";
import { html, toElement } from "../utils/dom";

export const NotFoundPage: Page = () => {
  document.title = "Page not found · Kino XII";

  return toElement(html`
    <section class="page page--centered">
      <h1 class="page__title">Page not found</h1>
      <p>The page you are looking for does not exist.</p>
      <a class="button button--primary" href="/">Back to home</a>
    </section>
  `);
};
