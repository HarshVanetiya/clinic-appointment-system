'use client'

import { ArrowUp, Sparkles, X } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import type { AssistantResponse, BookingProposalDTO, ChatTurn, ServiceCardDTO, SlotChipDTO } from '@/lib/assistant-types'
import { cn } from '@/lib/cn'
import { BookingCard } from './booking-card'
import { OPEN_EVENT } from './open-button'

interface Message extends ChatTurn {
  id: number
  services?: ServiceCardDTO[]
  slots?: SlotChipDTO[]
  slotsFor?: AssistantResponse['slotsFor']
  proposal?: BookingProposalDTO | null
}

const STARTERS = ['Lower back pain, tomorrow evening', 'Sports massage this Saturday', 'I had knee surgery last month']

const WELCOME: Message = {
  id: 0,
  role: 'assistant',
  text: 'Hello! Tell me what is bothering you and when you would like to come in. I will find a time and you can confirm it in a tap.',
}

export function AssistantWidget({ clinicName, phone }: { clinicName: string; phone: string }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([WELCOME])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [basicMode, setBasicMode] = useState(false)
  const nextId = useRef(1)
  const logRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const launcherRef = useRef<HTMLButtonElement>(null)
  // send() reads the latest state without being re-created on every message.
  const latest = useRef({ messages, busy })
  useEffect(() => {
    latest.current = { messages, busy }
  })

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim().slice(0, 600)
      if (!text || latest.current.busy) return
      const history: ChatTurn[] = [...latest.current.messages.slice(1).map(({ role, text: t }) => ({ role, text: t })), { role: 'user', text }]
      setInput('')
      setBusy(true)
      setMessages((prev) => [...prev, { id: nextId.current++, role: 'user', text }])
      let reply: Omit<Message, 'id'>
      try {
        const res = await fetch('/api/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: history }) })
        const data = (await res.json()) as AssistantResponse & { error?: string }
        if (res.status === 429 && data.error) reply = { role: 'assistant', text: data.error }
        else if (!res.ok) throw new Error('Request failed')
        else {
          setBasicMode(data.mode === 'basic')
          reply = { role: 'assistant', text: data.reply, services: data.services, slots: data.slots, slotsFor: data.slotsFor, proposal: data.proposal }
        }
      } catch {
        reply = { role: 'assistant', text: `Sorry, I could not connect just now. Please try again, use the Book page, or call ${phone}.` }
      }
      setMessages((prev) => [...prev, { ...reply, id: nextId.current++ }])
      setBusy(false)
    },
    [phone],
  )

  // Buttons elsewhere on the site open the chat, optionally with a first message.
  useEffect(() => {
    const onOpen = (event: Event) => {
      setOpen(true)
      const prompt = (event as CustomEvent<{ prompt?: string }>).detail?.prompt
      if (prompt) void send(prompt)
    }
    window.addEventListener(OPEN_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_EVENT, onOpen)
  }, [send])

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, busy, open])

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    void send(input)
  }

  // Stay out of the way once someone is already in the booking flow or managing a booking.
  const hidden = /^\/(book\/[^/]+|booking|manage|offline)/.test(pathname)
  if (hidden && !open) return null

  const lastId = messages[messages.length - 1]!.id

  return (
    <>
      {!open && (
        <button
          ref={launcherRef}
          type="button"
          onClick={() => setOpen(true)}
          className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 inline-flex h-14 items-center gap-2.5 rounded-full bg-green-900 pr-5 pl-3 text-sm font-semibold text-white shadow-lift transition-transform duration-200 ease-[var(--ease-out-soft)] hover:scale-[1.03] active:scale-[0.97] sm:right-6 sm:bottom-6"
        >
          <span className="grid size-9 place-items-center rounded-full bg-sage text-green-900">
            <Sparkles aria-hidden className="size-4" />
          </span>
          Book by chat
        </button>
      )}

      {open && (
        <section
          role="dialog"
          aria-label={`${clinicName} booking assistant`}
          className="fixed inset-0 z-50 flex animate-fade-up flex-col bg-paper sm:inset-auto sm:right-6 sm:bottom-6 sm:h-[min(42rem,calc(100dvh-3rem))] sm:w-[25rem] sm:overflow-hidden sm:rounded-[1.75rem] sm:shadow-lift sm:ring-1 sm:ring-line"
        >
          <header className="flex items-center gap-3 bg-green-900 px-4 py-3.5 pt-[max(0.875rem,env(safe-area-inset-top))] text-white">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-sage text-green-900">
              <Sparkles aria-hidden className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-base leading-tight font-bold text-white">Book by chat</h2>
              <p className="truncate text-xs text-white/70">{basicMode ? 'Basic mode: keyword matching, no AI key set' : 'AI assistant · books, does not give medical advice'}</p>
            </div>
            <button
              type="button"
              aria-label="Close chat"
              onClick={() => {
                setOpen(false)
                launcherRef.current?.focus()
              }}
              className="grid size-10 place-items-center rounded-full transition-colors hover:bg-white/10"
            >
              <X aria-hidden className="size-5" />
            </button>
          </header>

          <div ref={logRef} role="log" aria-live="polite" className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.map((m) => (
              <div key={m.id} className={cn('flex animate-fade-up flex-col', m.role === 'user' ? 'items-end' : 'items-start')}>
                <p
                  className={cn(
                    'max-w-[85%] rounded-2xl px-4 py-2.5 text-[0.95rem] leading-snug whitespace-pre-line',
                    m.role === 'user' ? 'rounded-br-md bg-green text-white' : 'rounded-bl-md bg-card ring-1 ring-line',
                  )}
                >
                  {m.text}
                </p>

                {m.services && m.services.length > 0 && (
                  <ul className="mt-2 flex w-full flex-col gap-2">
                    {m.services.map((s) => (
                      <li key={s.slug} className="flex items-center justify-between gap-3 rounded-2xl bg-card px-4 py-3 ring-1 ring-line">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{s.name}</p>
                          <p className="text-xs text-muted">
                            {s.durationLabel} · {s.priceLabel}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void send(`Find me a time for ${s.name}`)}
                          className="shrink-0 rounded-full bg-sage px-3.5 py-2 text-xs font-semibold text-green-900 hover:bg-sage-300 disabled:opacity-50"
                        >
                          Find a time
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {m.slots && m.slots.length > 0 && m.slotsFor && (
                  <div className="mt-2 w-full">
                    <p className="eyebrow mb-1.5">
                      {m.slotsFor.serviceName} · {m.slots[0]!.label.split(' · ')[0]}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {m.slots.map((slot) => (
                        <button
                          key={`${slot.date}${slot.time}`}
                          type="button"
                          // Only the newest set of times can be tapped; older ones may no longer be free.
                          disabled={busy || m.id !== lastId}
                          onClick={() => {
                            const withTherapist = m.slotsFor!.therapistLabel.startsWith('First available') ? '' : ` with ${m.slotsFor!.therapistLabel}`
                            void send(`Book ${m.slotsFor!.serviceName} on ${slot.label} (${slot.date} ${slot.time})${withTherapist}`)
                          }}
                          className="rounded-full bg-card px-3.5 py-2 text-sm font-semibold text-green ring-1 ring-green/40 transition-colors ring-inset hover:bg-sage-50 disabled:text-muted disabled:ring-line"
                        >
                          {slot.label.split(' · ')[1]}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {m.proposal && (m.id === lastId ? <BookingCard proposal={m.proposal} /> : <p className="mt-1.5 text-xs text-muted">Earlier booking card (replaced).</p>)}
              </div>
            ))}

            {busy && (
              <div className="flex w-fit gap-1.5 rounded-2xl rounded-bl-md bg-card px-4 py-3.5 ring-1 ring-line">
                <span className="sr-only">Assistant is typing</span>
                {[0, 1, 2].map((i) => (
                  <span key={i} className="size-1.5 animate-pulse rounded-full bg-green" style={{ animationDelay: `${i * 160}ms` }} />
                ))}
              </div>
            )}

            {messages.length === 1 && !busy && (
              <div className="flex flex-col items-start gap-2 pt-1">
                {STARTERS.map((s) => (
                  <button key={s} type="button" onClick={() => void send(s)} className="rounded-full bg-card px-4 py-2 text-left text-sm ring-1 ring-line-strong transition-colors hover:bg-sage-50 hover:ring-green">
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          <p className="border-t border-line bg-sage-50 px-4 py-2 text-xs text-muted">
            For emergencies call 112. Prefer a form?{' '}
            <Link href="/book" onClick={() => setOpen(false)} className="font-semibold text-green underline-offset-2 hover:underline">
              Book step by step
            </Link>
          </p>

          <form onSubmit={onSubmit} className="flex items-end gap-2 border-t border-line bg-card p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <label htmlFor="assistant-input" className="sr-only">
              Your message
            </label>
            <textarea
              id="assistant-input"
              ref={inputRef}
              rows={1}
              value={input}
              maxLength={600}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  void send(input)
                }
              }}
              placeholder="e.g. neck pain, Friday morning"
              className="max-h-28 min-h-11 flex-1 resize-none rounded-2xl border border-line-strong bg-paper px-4 py-2.5 text-base focus:border-green focus:ring-4 focus:ring-green/15 focus:outline-none"
            />
            <button type="submit" disabled={busy || !input.trim()} aria-label="Send" className="grid size-11 shrink-0 place-items-center rounded-full bg-green text-white transition-colors hover:bg-green-700 disabled:opacity-40">
              <ArrowUp aria-hidden className="size-5" />
            </button>
          </form>
        </section>
      )}
    </>
  )
}
