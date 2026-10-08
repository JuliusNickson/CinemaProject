import { html, toElement } from "../utils/dom";

export function Footer(): HTMLElement {
  const year = new Date().getFullYear();

  return toElement(html`
    <footer class="footer">
      <div class="footer__inner">
        <hr class="footer__divider" />
        <div class="footer__row">
          <a class="footer__logo text-button" href="/" aria-label="Kino XII home">
            <span>KINO</span><span class="footer__logo-accent">XII</span>
          </a>
          <p class="footer__copyright text-body-s">© ${year} Kino XII. All rights reserved.</p>
        </div>
      </div>
    </footer>
  `);
}
