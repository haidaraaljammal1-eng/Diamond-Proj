export type SevenStarsDevice = {
  id: number | string;
  uniqueId?: string | null;
  name?: string | null;
  status?: string | null;
  model?: string | null;
  category?: string | null;
  disabled?: boolean | null;
};

export type SevenStarsPosition = {
  id?: number | string | null;
  deviceId: number | string;
  serverTime?: string | null;
  deviceTime?: string | null;
  fixTime?: string | null;
  valid?: boolean | null;
  latitude?: number | null;
  longitude?: number | null;
  speed?: number | null;
  course?: number | null;
  address?: string | null;
  engine?: boolean | null;
  attributes?: Record<string, unknown> | null;
};
