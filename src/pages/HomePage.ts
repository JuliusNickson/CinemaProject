import type { Page } from "../router/router";
import { html, toElement } from "../utils/dom";

export const HomePage: Page = () => {
  document.title = "Kino XII";

  return toElement(html`
    <section class="page">
      <h1 class="page__title">Home</h1>
      <p class="page__placeholder">Featured, Now Playing and Coming Soon will appear here.</p>
    </section>
  `);
};
