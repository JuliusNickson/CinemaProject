import type { Format } from "./venue";

export type AgeRatingCode = "G" | "PG" | "12+" | "16+" | "18+";

export interface AgeRating {
  code: AgeRatingCode;
  /** Compare against the signed in user's age to gate booking. */
  minAge: number;
  /** Tooltip copy for the rating badge. */
  description: string;
}

export interface Genre {
  id: number;
  slug: string;
  name: string;
}

export type MovieKind = "film" | "event";

export interface Movie {
  id: number;
  slug: string;
  title: string;
  kind: MovieKind;
  runtimeMinutes: number;
  posterUrl: string | null;
  backdropUrl: string | null;
  /** `YYYY-MM-DD` */
  releaseDate: string;
  /** Coming soon titles have no sessions; offer "Notify me" instead of booking. */
  isComingSoon: boolean;
  isFeatured: boolean;
  /** Cheapest upcoming session price, in GEL. */
  fromPrice: number;
  ageRating: AgeRating;
  genres: Genre[];
  formats: Format[];
}

export interface MovieWithSynopsis extends Movie {
  synopsis: string;
}

export interface MovieDetail extends MovieWithSynopsis {
  director: string | null;
  cast: string | null;
  /** `YYYY-MM-DD` dates with at least one upcoming session. */
  availableDates: string[];
}

export interface NotifySubscription {
  movieId: number;
  subscribed: boolean;
}
