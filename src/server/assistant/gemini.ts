import 'server-only'
import type { ChatTurn } from '@/lib/assistant-types'
import { env } from '@/lib/env'
import type { LoadedContext } from './context'
import { systemPrompt } from './prompt'
import { runTool, toolDeclarations, type TurnState } from './tools'

// Google AI Studio (Gemini) over plain REST, so there is no SDK to install.
// To move to another provider, replace this one file: it only has to turn
// (history, context) into a reply while calling runTool for tool requests.

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'
const MAX_TOOL_ROUNDS = 6

interface Part {
  text?: string
  functionCall?: { name: string; args?: Record<string, unknown> }
  functionResponse?: { name: string; response: Record<string, unknown> }
  // Other fields (such as thought signatures) are passed back untouched.
  [key: string]: unknown
}
interface Content {
  role: 'user' | 'model'
  parts: Part[]
}

export const geminiConfigured = () => env().GEMINI_API_KEY.length > 0

export async function geminiReply(history: ChatTurn[], ctx: LoadedContext, state: TurnState): Promise<string> {
  const model = env().GEMINI_MODEL || 'gemini-flash-latest'
  const contents: Content[] = history.map((turn) => ({ role: turn.role === 'assistant' ? 'model' : 'user', parts: [{ text: turn.text }] }))
  const system = systemPrompt(ctx)

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const res = await fetch(`${API_BASE}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env().GEMINI_API_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents,
        tools: [{ functionDeclarations: toolDeclarations }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
      }),
      signal: AbortSignal.timeout(25_000),
    })
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`)

    const data = (await res.json()) as { candidates?: { content?: Content }[] }
    const parts = data.candidates?.[0]?.content?.parts ?? []
    const calls = parts.filter((p) => p.functionCall)

    if (calls.length === 0) {
      const text = parts.map((p) => p.text ?? '').join('').trim()
      return text || 'Sorry, I lost my thread there. Could you say that again?'
    }

    // Keep the model's turn exactly as it came back, then answer every call.
    contents.push({ role: 'model', parts })
    const responses: Part[] = []
    for (const part of calls) {
      const call = part.functionCall!
      responses.push({ functionResponse: { name: call.name, response: await runTool(call.name, call.args ?? {}, ctx, state) } })
    }
    contents.push({ role: 'user', parts: responses })
  }

  return state.proposal ? 'Please check the details on the card below.' : 'Here is what I found. Tell me what you would like to change.'
}
