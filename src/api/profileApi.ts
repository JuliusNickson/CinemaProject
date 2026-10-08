import { put, toFormData, type ApiResponse } from "./client";
import type { User } from "../types/auth";
import type { UpdateProfilePayload } from "../types/profile";

export async function updateProfile(payload: UpdateProfilePayload): Promise<User> {
  const { data } = await put<ApiResponse<User>>("/profile", toFormData({ ...payload }));
  return data;
}
