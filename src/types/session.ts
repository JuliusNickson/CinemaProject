import type { AgeRating, Movie } from "./movie";
import type { TicketType } from "./ticket";
import type { Format, Language, Venue } from "./venue";

export type TimeBand = "morning" | "afternoon" | "evening";

export type SessionSort = "time_asc" | "time_desc" | "price_asc" | "price_desc" | "title_asc";

export interface Hall {
  id: number;
  name: string;
}

export interface Session {
  id: number;
  /** ISO date-time */
  startsAt: string;
  /** `YYYY-MM-DD` */
  date: string;
  /** `HH:mm` */
  time: string;
  timeBand: TimeBand;
  /** Adult price including the format uplift, in GEL. */
  price: number;
  /** Live count; can drop while the page is open. */
  seatsLeft: number;
  isSoldOut: boolean;
  hall: Hall;
  venue: Venue;
  format: Format;
  language: Language;
  movie: Movie;
}

export interface SessionFilters {
  /** `YYYY-MM-DD`, defaults to today on the server. */
  date?: string;
  venues?: string[];
  formats?: string[];
  languages?: string[];
  bands?: TimeBand[];
  search?: string;
  sort?: SessionSort;
  page?: number;
}

export interface MovieSessionsGroup {
  movie: Movie;
  sessions: Session[];
}

export interface VenueSessionsGroup {
  venue: Venue;
  sessions: Session[];
}

export interface SessionsMeta {
  currentPage: number;
  lastPage: number;
  /** Films per page, not sessions. */
  perPage: number;
  /** Drives the "Showing X sessions" counter. */
  totalSessions: number;
  totalMovies: number;
  date: string;
}

export interface SessionsPage {
  data: MovieSessionsGroup[];
  meta: SessionsMeta;
}

export interface FilterOption<T extends string = string> {
  id: T;
  label: string;
}

export interface FilterOptions {
  venues: Venue[];
  formats: Format[];
  languages: Language[];
  timeBands: FilterOption<TimeBand>[];
  sorts: FilterOption<SessionSort>[];
  ticketTypes: TicketType[];
  ageRatings: AgeRating[];
  maxSeatsPerOrder: number;
  holdMinutes: number;
}
