import type { TicketTypeRef, TicketTypeSlug } from "./ticket";
import type { Venue } from "./venue";

export type SeatState = "available" | "sold" | "held" | "unavailable";

export interface Seat {
  /** Send this as `seatId` when holding seats, never `code`. */
  id: number;
  /** Human label, e.g. `E7`. */
  code: string;
  /** Number within the row, e.g. `7`. */
  label: string;
  state: SeatState;
  /** A gangway runs to the right of this seat. */
  aisleAfter: boolean;
  /** Part of the current user's live hold. */
  isMine: boolean;
}

export interface SeatRow {
  label: string;
  seats: Seat[];
}

export interface SeatSection {
  name: string;
  rows: SeatRow[];
}

export interface SeatMap {
  sessionId: number;
  hall: {
    id: number;
    name: string;
    venue: Venue;
  };
  sections: SeatSection[];
}

export interface HoldSeatInput {
  seatId: number;
  ticketType: TicketTypeSlug;
}

export interface HeldSeat {
  seatId: number;
  code: string;
  ticketType: TicketTypeRef;
  price: number;
}

export interface SeatHold {
  holdId: string;
  sessionId: number;
  /** ISO date-time; drive the countdown from this. */
  expiresAt: string;
  secondsRemaining: number;
  isLive: boolean;
  subtotal: number;
  seats: HeldSeat[];
}
