export interface Format {
  id: number;
  slug: string;
  name: string;
  /** Added to the film base price, in GEL. */
  priceUplift: number;
}

export interface Venue {
  id: number;
  /** Value for the `venues[]` filter. */
  slug: string;
  name: string;
  city: string;
  /** Formats this venue can show; narrows the format filter when venues are selected. */
  formats: Format[];
}

export interface Language {
  id: number;
  /** Value for the `languages[]` filter. */
  slug: string;
  name: string;
  /** Short badge of the spoken language, e.g. `ENG`, `GEO`. */
  code: string;
}
