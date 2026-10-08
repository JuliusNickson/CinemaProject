import type { Session } from "./session";

export type TicketTypeSlug = "adult" | "child" | "student";

export interface TicketType {
  id: number;
  slug: TicketTypeSlug;
  name: string;
  /** Multiplied by the session price to get this ticket's price. */
  priceRatio: number;
  note: string | null;
  /** Refused when the film's `minAge` is at or above this. */
  blockedFromRatingAge: number | null;
}

export interface TicketTypeRef {
  slug: TicketTypeSlug;
  name: string;
}

export interface OrderTicket {
  id: number;
  seatCode: string;
  ticketType: TicketTypeRef;
  price: number;
}

export type OrderStatus = "paid" | "refunded";

export interface Order {
  id: number;
  /** Order code, e.g. `KX-7QF2LD`; also the refund path key. */
  reference: string;
  status: OrderStatus;
  totalPrice: number;
  paidAt: string;
  refundedAt: string | null;
  isUpcoming: boolean;
  /** Drive the Refund button from this; never compute the cutoff client side. */
  isRefundable: boolean;
  cardLastFour: string;
  contact: {
    fullName: string;
    email: string;
    mobileNumber: string;
  };
  session: Session;
  tickets: OrderTicket[];
}

export interface CreateOrderPayload {
  holdId: string;
  fullName: string;
  email: string;
  mobileNumber: string;
  cardNumber: string;
  /** `MM/YY` */
  expiry: string;
  cvv: string;
}

export type TicketsFilter = "upcoming" | "past";
