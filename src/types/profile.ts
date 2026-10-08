export interface UpdateProfilePayload {
  fullName: string;
  /** 9 digits starting with 5; spaces are stripped server side. */
  mobileNumber: string;
  /** `YYYY-MM-DD`, at least 12 years ago. */
  dateOfBirth: string;
  preferredVenueId?: number | null;
  avatar?: File;
}
