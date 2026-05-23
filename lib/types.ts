export type DayOfWeek = "mon" | "tue" | "thu";
export type OfficeType = "VP" | "MO";
export type ReservationStatus = "assigned" | "eliminated" | "cancelled";

export interface Player {
  game_id: number;
  name: string;
  alliance: string;
  speedup_mon: number;
  speedup_tue: number;
  speedup_thu: number;
}

export interface Slot {
  id: number;
  day_of_week: DayOfWeek;
  office_type: OfficeType;
  block_start_utc: number;
  slot_index: number;
  is_active: boolean;
}

export interface Reservation {
  id: string;
  player_id: number;
  slot_id: number;
  status: ReservationStatus;
  cycle_id: number;
  applied_at: string;
}

export interface Preference {
  id: string;
  player_id: number;
  day_of_week: DayOfWeek;
  block_start_utc: number;
  cycle_id: number;
}

export const DAY_CONFIG: Record<
  DayOfWeek,
  { label: string; office: OfficeType; speedupKey: "speedup_mon" | "speedup_tue" | "speedup_thu" }
> = {
  mon: { label: "Monday", office: "VP", speedupKey: "speedup_mon" },
  tue: { label: "Tuesday", office: "VP", speedupKey: "speedup_tue" },
  thu: { label: "Thursday", office: "MO", speedupKey: "speedup_thu" },
};

export const TIME_BLOCKS = Array.from({ length: 12 }, (_, i) => i * 2);
