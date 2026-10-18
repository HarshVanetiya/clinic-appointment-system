'use client'

import { ChevronLeft, ChevronRight, CalendarX2, RefreshCw, Users } from 'lucide-react'
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { AvailabilityDTO, SlotDTO, TherapistOption } from '@/lib/booking-types'
import { cn } from '@/lib/cn'
import { formatLocalDate } from '@/lib/format'
import { addDays, startOfWeek, utcToLocal, type LocalDate } from '@/lib/time'
import { Button } from '@/components/ui/button'
import { Avatar, Skeleton } from '@/components/ui/primitives'

export interface SlotSelection {
  start: string
  label: string
  date: LocalDate
  therapist: string // 'any' | therapist id
  therapistIds: string[]
}

interface Props {
  serviceSlug: string
  therapists: TherapistOption[]
  initialTherapist: string
  initial: AvailabilityDTO
  initialStart?: string | null
  mode?: 'patient' | 'staff'
  /** Reschedule token: lets the patient's current booking not block itself. */
  token?: string
  allowAny?: boolean
  /** Mirror therapist/week into the URL so refresh & back keep your place. */
  syncUrl?: boolean
  onChange?: (selection: SlotSelection | null) => void
  /** Increment to force a refetch of the current week (e.g. after a conflict). */
  refreshKey?: number
  footer: (selection: SlotSelection | null) => ReactNode
}

type Status = 'idle' | 'loading' | 'error'

const PERIODS = [
  { key: 'morning', label: 'Morning', test: (m: number) => m < 12 * 60 },
  { key: 'afternoon', label: 'Afternoon', test: (m: number) => m >= 12 * 60 && m < 17 * 60 },
  { key: 'evening', label: 'Evening', test: (m: number) => m >= 17 * 60 },
] as const

/** Roving-focus keyboard handling for a linear group of buttons (ARIA radiogroup pattern). */
function useRovingKeys(count: number, onMove: (index: number) => void) {
  return useCallback(
    (e: KeyboardEvent, index: number) => {
      let next = -1
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (index + 1) % count
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (index - 1 + count) % count
      else if (e.key === 'Home') next = 0
      else if (e.key === 'End') next = count - 1
      if (next >= 0) {
        e.preventDefault()
        onMove(next)
      }
    },
    [count, onMove],
  )
}

export function SlotPicker({
  serviceSlug,
  therapists,
  initialTherapist,
  initial,
  initialStart,
  mode = 'patient',
  token,
  allowAny = true,
  syncUrl = false,
  onChange,
  refreshKey = 0,
  footer,
}: Props) {
  const [therapist, setTherapist] = useState(initialTherapist)
  const [data, setData] = useState(initial)
  const [status, setStatus] = useState<Status>('idle')
  const [selectedStart, setSelectedStart] = useState<string | null>(initialStart ?? null)
  const firstDayWithSlots = (d: AvailabilityDTO) => d.days.find((x) => x.slots.length)?.date ?? d.days.find((x) => x.date >= d.today)?.date ?? d.weekStart
  const [selectedDate, setSelectedDate] = useState<LocalDate>(() =>
    initialStart ? utcToLocal(Date.parse(initialStart), initial.timeZone).date : firstDayWithSlots(initial),
  )
  const abortRef = useRef<AbortController | null>(null)
  const requestRef = useRef<{ therapist: string; week: LocalDate }>({ therapist: initialTherapist, week: initial.weekStart })
  const dayRefs = useRef<(HTMLButtonElement | null)[]>([])
  const slotRefs = useRef<(HTMLButtonElement | null)[]>([])

  const tz = data.timeZone
  const day = data.days.find((d) => d.date === selectedDate)
  const slots = useMemo(() => day?.slots ?? [], [day])
  let selection: SlotSelection | null = null
  if (selectedStart) {
    for (const d of data.days) {
      const s = d.slots.find((x) => x.start === selectedStart)
      if (s) selection = { start: s.start, label: s.label, date: d.date, therapist, therapistIds: s.therapistIds }
    }
  }
  // Notify the parent only when the chosen slot actually changes.
  const selectionKey = selection ? `${selection.start}|${selection.therapist}` : ''
  const notify = useEffectEvent(() => onChange?.(selection))
  useEffect(() => notify(), [selectionKey])

  const load = useCallback(
    async (nextTherapist: string, week: LocalDate) => {
      requestRef.current = { therapist: nextTherapist, week }
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      setStatus('loading')
      try {
        const params = new URLSearchParams({ service: serviceSlug, therapist: nextTherapist, week, mode })
        if (token) params.set('token', token)
        const res = await fetch(`/api/availability?${params}`, { signal: controller.signal, cache: 'no-store' })
        if (!res.ok) throw new Error(String(res.status))
        const json = (await res.json()) as AvailabilityDTO
        setData(json)
        setStatus('idle')
        setSelectedDate((prev) => (json.days.some((d) => d.date === prev && d.slots.length) ? prev : firstDayWithSlots(json)))
        setSelectedStart((prev) => (prev && json.days.some((d) => d.slots.some((s) => s.start === prev)) ? prev : null))
        if (syncUrl) {
          const url = new URL(window.location.href)
          url.searchParams.set('therapist', nextTherapist)
          url.searchParams.set('week', json.weekStart)
          window.history.replaceState(null, '', url)
        }
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setStatus('error')
      }
    },
    [serviceSlug, mode, token, syncUrl],
  )

  useEffect(() => () => abortRef.current?.abort(), [])

  useEffect(() => {
    if (refreshKey > 0) void load(requestRef.current.therapist, requestRef.current.week)
  }, [refreshKey, load])

  const thisWeek = startOfWeek(data.today)
  const canPrev = data.weekStart > thisWeek
  const canNext = addDays(data.weekStart, 7) <= data.lastBookableDate

  const chooseTherapist = (id: string) => {
    if (id === therapist) return
    setTherapist(id)
    void load(id, data.weekStart)
  }

  const therapistOptions = useMemo(
    () => [...(allowAny ? [{ id: 'any', name: 'Any available', title: 'Soonest times', accent: '' }] : []), ...therapists],
    [allowAny, therapists],
  )
  const therapistKeys = useRovingKeys(therapistOptions.length, (i) => {
    const opt = therapistOptions[i]!
    chooseTherapist(opt.id)
    document.getElementById(`therapist-${opt.id}`)?.focus()
  })

  const selectableDays = data.days
  const dayKeys = useRovingKeys(selectableDays.length, (i) => {
    setSelectedDate(selectableDays[i]!.date)
    dayRefs.current[i]?.focus()
  })
  const slotKeys = useRovingKeys(slots.length, (i) => {
    setSelectedStart(slots[i]!.start)
    slotRefs.current[i]?.focus()
  })

  const grouped = useMemo(() => {
    let i = 0
    return PERIODS.map((p) => ({
      ...p,
      slots: slots.filter((s) => p.test(utcToLocal(Date.parse(s.start), tz).minutes)).map((s) => ({ slot: s, index: i++ })),
    })).filter((g) => g.slots.length)
  }, [slots, tz])

  const activeSlotIndex = Math.max(0, slots.findIndex((s) => s.start === selectedStart))
  const activeDayIndex = Math.max(0, selectableDays.findIndex((d) => d.date === selectedDate))
  const weekLabel = `${formatLocalDate(data.weekStart, { day: 'numeric', month: 'short' })} – ${formatLocalDate(addDays(data.weekStart, 6), { day: 'numeric', month: 'short', year: 'numeric' })}`
  const dayLong = formatLocalDate(selectedDate, { weekday: 'long', day: 'numeric', month: 'long' })
  const totalWeek = data.days.reduce((n, d) => n + d.slots.length, 0)
  const loading = status === 'loading'

  return (
    <div className="space-y-6">
      {/* Therapist */}
      {therapistOptions.length > 1 && (
        <fieldset>
          <legend className="mb-3 text-sm font-semibold text-ink-soft">Therapist</legend>
          <div role="radiogroup" aria-label="Therapist" className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
            {therapistOptions.map((t, i) => {
              const checked = t.id === therapist
              return (
                <button
                  key={t.id}
                  id={`therapist-${t.id}`}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  tabIndex={checked ? 0 : -1}
                  onClick={() => chooseTherapist(t.id)}
                  onKeyDown={(e) => therapistKeys(e, i)}
                  className={cn(
                    'flex shrink-0 snap-start items-center gap-2.5 rounded-full py-1.5 pr-4 pl-1.5 text-left text-sm transition-[background-color,box-shadow] duration-200 active:scale-[0.98]',
                    checked ? 'bg-green text-white shadow-soft' : 'bg-card text-ink ring-1 ring-line hover:ring-green/50',
                  )}
                >
                  {t.id === 'any' ? (
                    <span className={cn('flex size-8 items-center justify-center rounded-full', checked ? 'bg-white/15' : 'bg-sage text-green')}>
                      <Users aria-hidden className="size-4" />
                    </span>
                  ) : (
                    <Avatar name={t.name} accent={t.accent} size={32} />
                  )}
                  <span className="font-semibold">{t.name}</span>
                </button>
              )
            })}
          </div>
        </fieldset>
      )}

      {/* Week strip */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink-soft" id="week-label">
            <span className="sr-only">Week of </span>
            {weekLabel}
          </h2>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => load(therapist, addDays(data.weekStart, -7))}
              disabled={!canPrev || loading}
              aria-label="Previous week"
              className="flex size-10 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-sage-100 active:scale-95 disabled:opacity-35"
            >
              <ChevronLeft aria-hidden className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => load(therapist, addDays(data.weekStart, 7))}
              disabled={!canNext || loading}
              aria-label="Next week"
              className="flex size-10 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-sage-100 active:scale-95 disabled:opacity-35"
            >
              <ChevronRight aria-hidden className="size-5" />
            </button>
          </div>
        </div>
        <div role="radiogroup" aria-labelledby="week-label" className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {selectableDays.map((d, i) => {
            const checked = d.date === selectedDate
            const count = d.slots.length
            const past = d.date < data.today
            return (
              <button
                key={d.date}
                ref={(el) => {
                  dayRefs.current[i] = el
                }}
                type="button"
                role="radio"
                aria-checked={checked}
                aria-label={`${formatLocalDate(d.date, { weekday: 'long', day: 'numeric', month: 'long' })}, ${past ? 'past' : count ? `${count} times available` : 'no times available'}`}
                tabIndex={i === activeDayIndex ? 0 : -1}
                onClick={() => setSelectedDate(d.date)}
                onKeyDown={(e) => dayKeys(e, i)}
                className={cn(
                  'flex flex-col items-center rounded-2xl py-2.5 transition-[background-color,box-shadow,color] duration-200 active:scale-[0.97] sm:py-3',
                  checked ? 'bg-green text-white shadow-soft' : count ? 'bg-card text-ink ring-1 ring-line hover:ring-green/50' : 'bg-transparent text-muted',
                )}
              >
                <span className="font-mono text-[0.62rem] tracking-wider uppercase">{formatLocalDate(d.date, { weekday: 'short' })}</span>
                <span className="font-display text-lg leading-tight font-bold sm:text-xl">{formatLocalDate(d.date, { day: 'numeric' })}</span>
                <span aria-hidden className={cn('mt-1 size-1.5 rounded-full', count ? (checked ? 'bg-white' : 'bg-green') : 'bg-transparent')} />
              </button>
            )
          })}
        </div>
      </div>

      {/* Slots */}
      <section aria-labelledby="slots-heading" aria-busy={loading} className="min-h-56">
        <h2 id="slots-heading" className="mb-3 text-sm font-semibold text-ink-soft">
          {dayLong}
        </h2>
        <p aria-live="polite" className="sr-only">
          {loading ? 'Loading available times…' : status === 'error' ? 'Could not load times.' : `${slots.length} times available on ${dayLong}.`}
        </p>

        {loading ? (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
            {Array.from({ length: 12 }, (_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : status === 'error' ? (
          <div role="alert" className="flex flex-col items-center rounded-[var(--radius-card)] bg-danger-bg/60 px-6 py-10 text-center">
            <p className="font-semibold text-danger">We couldn&apos;t load available times.</p>
            <p className="mt-1 text-sm text-muted">Check your connection and try again.</p>
            <Button variant="secondary" size="sm" className="mt-4" onClick={() => load(requestRef.current.therapist, requestRef.current.week)}>
              <RefreshCw aria-hidden className="size-4" /> Try again
            </Button>
          </div>
        ) : slots.length === 0 ? (
          <div className="flex flex-col items-center rounded-[var(--radius-card)] border border-dashed border-line-strong bg-card/60 px-6 py-10 text-center">
            <span className="flex size-11 items-center justify-center rounded-full bg-sage text-green">
              <CalendarX2 aria-hidden className="size-5" />
            </span>
            <p className="mt-3 font-semibold">{totalWeek ? 'No times on this day' : 'No times this week'}</p>
            <p className="mt-1 max-w-xs text-sm text-muted">
              {totalWeek
                ? 'Pick another day with a dot underneath it.'
                : data.nextAvailable
                  ? `The next available day is ${formatLocalDate(data.nextAvailable, { weekday: 'long', day: 'numeric', month: 'long' })}.`
                  : therapist !== 'any' && allowAny
                    ? 'Try "Any available" to see times with other therapists.'
                    : 'Please call the clinic and we will do our best to fit you in.'}
            </p>
            {!totalWeek && data.nextAvailable && (
              <Button
                variant="secondary"
                size="sm"
                className="mt-4"
                onClick={() => {
                  setSelectedDate(data.nextAvailable!)
                  void load(therapist, startOfWeek(data.nextAvailable!))
                }}
              >
                Jump to next available
              </Button>
            )}
          </div>
        ) : (
          <div role="radiogroup" aria-labelledby="slots-heading" className="space-y-5">
            {grouped.map((g) => (
              <div key={g.key}>
                <p className="eyebrow mb-2">{g.label}</p>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
                  {g.slots.map(({ slot, index }) => (
                    <SlotButton
                      key={slot.start}
                      slot={slot}
                      checked={slot.start === selectedStart}
                      tabIndex={index === activeSlotIndex ? 0 : -1}
                      refCb={(el) => {
                        slotRefs.current[index] = el
                      }}
                      onSelect={() => setSelectedStart(slot.start)}
                      onKeyDown={(e) => slotKeys(e, index)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {footer(selection)}
    </div>
  )
}

function SlotButton({
  slot,
  checked,
  tabIndex,
  refCb,
  onSelect,
  onKeyDown,
}: {
  slot: SlotDTO
  checked: boolean
  tabIndex: number
  refCb: (el: HTMLButtonElement | null) => void
  onSelect: () => void
  onKeyDown: (e: KeyboardEvent) => void
}) {
  return (
    <button
      ref={refCb}
      type="button"
      role="radio"
      aria-checked={checked}
      tabIndex={tabIndex}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      className={cn(
        'h-12 rounded-2xl text-[0.95rem] font-semibold tabular-nums transition-[background-color,box-shadow,color,transform] duration-150 ease-[var(--ease-out-soft)] active:scale-[0.96]',
        checked ? 'bg-green text-white shadow-soft' : 'bg-card text-ink ring-1 ring-line hover:bg-sage-50 hover:ring-green/60',
      )}
    >
      {slot.label}
    </button>
  )
}
