import type { LocalDate } from './time'

/** Wire format shared by the availability API and the slot picker. */
export interface SlotDTO {
  start: string // ISO UTC
  label: string // "9:30 am" in clinic time
  therapistIds: string[]
}

export interface DayDTO {
  date: LocalDate
  slots: SlotDTO[]
}

export interface AvailabilityDTO {
  timeZone: string
  weekStart: LocalDate
  today: LocalDate
  lastBookableDate: LocalDate
  days: DayDTO[]
  /** When this week is empty: the next date that has a slot, if any. */
  nextAvailable: LocalDate | null
}

export interface TherapistOption {
  id: string
  name: string
  title: string
  accent: string
}
