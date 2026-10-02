import Anthropic from "@anthropic-ai/sdk";
import { getApiKey } from "./apiKey";
import { config } from "./config";
import type { Turn } from "./store";

const SYSTEM_PROMPT = `You are Claude, talking with the user through an Amazon Echo. Everything you write is read aloud by a text-to-speech voice, so:
- Answer in plain spoken sentences. No markdown, bullet points, headings, tables, code blocks, URLs, or emoji.
- Keep it short: one to three sentences by default. Go longer only when the user asks for detail, and even then stay under about 150 words.
- Write numbers, units, and symbols the way a person would say them.
- If the question is ambiguous, give your best short answer and offer to go deeper rather than asking several questions.
- The user can't see anything, so never refer to formatting, links, or "below".`;

export type ChatResult = { kind: "ok"; text: string } | { kind: "timeout" } | { kind: "error"; message: string };

export interface ChatClient {
  reply(history: Turn[]): Promise<ChatResult>;
}

export class AnthropicChatClient implements ChatClient {
  private client?: Anthropic;

  private async getClient(): Promise<Anthropic> {
    this.client ??= new Anthropic({ apiKey: await getApiKey() });
    return this.client;
  }

  async reply(history: Turn[]): Promise<ChatResult> {
    try {
      const client = await this.getClient();
      const response = await client.messages.create(
        {
          model: config.model,
          max_tokens: config.maxTokens,
          system: SYSTEM_PROMPT,
          messages: history,
        },
        // No retries: a retry can't finish inside Alexa's response window.
        { timeout: config.claudeTimeoutMs, maxRetries: 0 },
      );

      if (response.stop_reason === "refusal") {
        return { kind: "ok", text: "Sorry, I can't help with that one." };
      }
      const text = response.content
        .flatMap((block) => (block.type === "text" ? [block.text] : []))
        .join(" ")
        .trim();
      return text ? { kind: "ok", text } : { kind: "error", message: "empty response" };
    } catch (err) {
      if (err instanceof Anthropic.APIConnectionTimeoutError) return { kind: "timeout" };
      if (err instanceof Anthropic.AuthenticationError) return { kind: "error", message: "invalid API key" };
      if (err instanceof Anthropic.RateLimitError) return { kind: "error", message: "rate limited" };
      if (err instanceof Anthropic.APIConnectionError) return { kind: "error", message: "connection error" };
      if (err instanceof Anthropic.APIError) return { kind: "error", message: `${err.status ?? ""} ${err.message}` };
      throw err;
    }
  }
}
