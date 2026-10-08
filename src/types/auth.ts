import type { Venue } from "./venue";

export interface User {
  id: number;
  username: string;
  email: string;
  avatar: string | null;
  fullName: string | null;
  mobileNumber: string | null;
  /** `YYYY-MM-DD` */
  dateOfBirth: string | null;
  /** Null until the profile is complete. */
  age: number | null;
  preferredVenue: Venue | null;
  /** Booking is blocked while false. */
  profileComplete: boolean;
}

export interface AuthResult {
  user: User;
  token: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  username: string;
  email: string;
  password: string;
  password_confirmation: string;
  avatar?: File;
}
