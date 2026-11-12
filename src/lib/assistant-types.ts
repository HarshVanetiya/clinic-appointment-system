/** Wire format shared by the assistant API and the chat widget. */

export interface ChatTurn {
  role: 'user' | 'assistant'
  text: string
}

export interface ServiceCardDTO {
  slug: string
  name: string
  durationLabel: string
  priceLabel: string
}

export interface SlotChipDTO {
  /** YYYY-MM-DD in clinic time. */
  date: string
  /** 24-hour HH:MM in clinic time. */
  time: string
  /** "Thu, 12 Nov · 5:30 pm" */
  label: string
}

/** Everything the confirm card needs. The patient's own details are typed into the card, never sent to the AI. */
export interface BookingProposalDTO {
  serviceId: string
  serviceSlug: string
  serviceName: string
  /** Therapist id, or 'any'. */
  therapist: string
  therapistLabel: string
  /** ISO UTC instant. */
  start: string
  whenLabel: string
  durationLabel: string
  priceLabel: string
}

export interface AssistantResponse {
  reply: string
  services: ServiceCardDTO[]
  slots: SlotChipDTO[]
  /** Service the slot chips belong to, so tapping one is unambiguous. */
  slotsFor: { serviceSlug: string; serviceName: string; therapistLabel: string } | null
  proposal: BookingProposalDTO | null
  /** 'ai' when Gemini answered, 'basic' for the built-in keyword helper. */
  mode: 'ai' | 'basic'
}
