import { get, post, type ApiResponse } from "./client";
import type { CreateOrderPayload, Order, TicketsFilter } from "../types/ticket";

/** Turns a live hold into a paid order. Payment is simulated. */
export async function createOrder(payload: CreateOrderPayload): Promise<Order> {
  const { data } = await post<ApiResponse<Order>>("/orders", payload);
  return data;
}

/** `reference` is the order code, e.g. `KX-7QF2LD`. */
export async function refundOrder(reference: string): Promise<Order> {
  const { data } = await post<ApiResponse<Order>>(`/orders/${encodeURIComponent(reference)}/refund`);
  return data;
}

/** Without a filter, returns both upcoming and past orders, newest session first. */
export async function getTickets(filter?: TicketsFilter, signal?: AbortSignal): Promise<Order[]> {
  const { data } = await get<ApiResponse<Order[]>>("/tickets", { query: { filter }, signal });
  return data;
}
