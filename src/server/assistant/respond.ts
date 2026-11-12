import 'server-only'
import type { AssistantResponse, ChatTurn } from '@/lib/assistant-types'
import { basicReply } from './basic'
import { loadContext } from './context'
import { geminiConfigured, geminiReply } from './gemini'
import { emptyTurn } from './tools'

/** One chat turn: the AI when a key is configured, the keyword helper otherwise or on failure. */
export async function respond(history: ChatTurn[], now = Date.now()): Promise<AssistantResponse> {
  const ctx = await loadContext(now)

  if (geminiConfigured()) {
    const state = emptyTurn()
    try {
      const reply = await geminiReply(history, ctx, state)
      return { reply, ...state, mode: 'ai' }
    } catch (error) {
      console.error('[assistant] Gemini call failed', error)
    }
  }

  const state = emptyTurn()
  const reply = await basicReply(history, ctx, state)
  return { reply, ...state, mode: 'basic' }
}
