"use client"

import { useState } from "react"
import { Sparkles, Send, Copy, Check, MessageSquareText } from "lucide-react"
import type { Lead } from "@/types"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { STAGE_LABELS } from "@/lib/constants"
import { formatCurrency } from "@/lib/format"
import { cn } from "@/lib/utils"

interface Suggestion {
  id: string
  label: string
  prompt: string
}

/**
 * Deterministic "AI" reply generator. Phase 1 mock — Phase 2 swaps this for a
 * streaming call to the AI SDK route while keeping the same message shape.
 */
function generateReply(lead: Lead, prompt: string): string {
  const first = lead.name.split(" ")[0]
  if (/whatsapp|message|mensaje|text/i.test(prompt)) {
    return `Hi ${first}! Thanks for your interest coming from ${lead.campaignName}. I'd love to show you how we can help — do you have 10 minutes today or tomorrow for a quick call?`
  }
  if (/objection|precio|price|expensive|cost/i.test(prompt)) {
    return `${first} is likely price-sensitive. Lead with the outcome, not the fee: anchor on the ${formatCurrency(
      lead.potentialValue,
    )} value at stake, then offer a starter option. Ask what result would make this a clear yes.`
  }
  if (/next|action|siguiente|do/i.test(prompt)) {
    return `Best next step for ${first}: ${lead.nextAction}. They are in "${STAGE_LABELS[lead.stage]}" with a score of ${lead.score}/100 — move fast while intent is high.`
  }
  return `${first} scored ${lead.score}/100 from ${lead.campaignName}. They look ${lead.temperature.toUpperCase()}. I'd ${lead.nextAction.toLowerCase()} and reference the creative they engaged with to keep context warm.`
}

const SUGGESTIONS: Suggestion[] = [
  { id: "s1", label: "Draft a WhatsApp opener", prompt: "Draft a WhatsApp message to open the conversation" },
  { id: "s2", label: "What's the best next action?", prompt: "What is the best next action for this lead?" },
  { id: "s3", label: "Handle price objection", prompt: "How do I handle a price objection?" },
]

interface Message {
  id: string
  role: "user" | "assistant"
  text: string
}

export function LeadAiAssistant({ lead }: { lead: Lead }) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "m0",
      role: "assistant",
      text: generateReply(lead, "summary"),
    },
  ])
  const [input, setInput] = useState("")
  const [copiedId, setCopiedId] = useState<string | null>(null)

  function send(prompt: string) {
    if (!prompt.trim()) return
    const userMsg: Message = { id: `u-${Date.now()}`, role: "user", text: prompt }
    const aiMsg: Message = {
      id: `a-${Date.now()}`,
      role: "assistant",
      text: generateReply(lead, prompt),
    }
    setMessages((prev) => [...prev, userMsg, aiMsg])
    setInput("")
  }

  function copy(id: string, text: string) {
    navigator.clipboard?.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 1500)
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-primary/20 bg-primary/[0.03] p-3">
      <div className="flex items-center gap-2">
        <div className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Sparkles className="size-3.5" />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold leading-none">Royal AI Assistant</span>
          <span className="text-xs text-muted-foreground">Coaching for this lead</span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {messages.map((m) => (
          <div
            key={m.id}
            className={cn(
              "group/msg flex flex-col gap-1 rounded-lg px-3 py-2 text-sm",
              m.role === "assistant"
                ? "bg-card text-card-foreground shadow-sm"
                : "self-end bg-primary text-primary-foreground",
            )}
          >
            <p className="leading-relaxed text-pretty">{m.text}</p>
            {m.role === "assistant" && (
              <button
                type="button"
                onClick={() => copy(m.id, m.text)}
                className="flex w-fit items-center gap-1 text-xs text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/msg:opacity-100"
              >
                {copiedId === m.id ? (
                  <>
                    <Check className="size-3" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="size-3" /> Copy
                  </>
                )}
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {SUGGESTIONS.map((s) => (
          <Badge
            key={s.id}
            variant="outline"
            className="cursor-pointer gap-1 border-primary/30 bg-background font-normal hover:bg-primary/5"
            onClick={() => send(s.prompt)}
          >
            <MessageSquareText className="size-3" />
            {s.label}
          </Badge>
        ))}
      </div>

      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          send(input)
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) {
              e.preventDefault()
              send(input)
            }
          }}
          placeholder="Ask Royal AI about this lead..."
          className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <Button type="submit" size="icon-sm" disabled={!input.trim()}>
          <Send className="size-3.5" />
          <span className="sr-only">Send</span>
        </Button>
      </form>
    </div>
  )
}
