/** Markup that has already been escaped and can be inserted as is. */
export class SafeHtml {
  readonly value: string;

  constructor(value: string) {
    this.value = value;
  }

  toString(): string {
    return this.value;
  }
}

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

/** Marks a trusted string as safe markup. Never pass API data through this. */
export function raw(markup: string): SafeHtml {
  return new SafeHtml(markup);
}

function renderValue(value: unknown): string {
  if (value === null || value === undefined || value === false) return "";
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map(renderValue).join("");
  return escapeHtml(String(value));
}

/**
 * Tagged template that escapes every interpolated value, except nested `html` results.
 * `null`, `undefined` and `false` render nothing, so `${cond && html`...`}` works.
 */
export function html(strings: TemplateStringsArray, ...values: unknown[]): SafeHtml {
  let markup = strings[0];
  values.forEach((value, index) => {
    markup += renderValue(value) + strings[index + 1];
  });
  return new SafeHtml(markup);
}

/** Builds a single element from markup with exactly one root element. */
export function toElement<T extends HTMLElement = HTMLElement>(markup: SafeHtml): T {
  const template = document.createElement("template");
  template.innerHTML = markup.value.trim();

  const element = template.content.firstElementChild;
  if (!(element instanceof HTMLElement)) throw new Error("toElement: markup has no root element");
  return element as T;
}
