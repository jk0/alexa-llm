import type { RequestEnvelope, ResponseEnvelope } from "ask-sdk-model";
import { describe, expect, it, vi } from "vitest";
import type { ChatClient, ChatResult } from "../src/chat";
import { buildSkill } from "../src/skill";
import { type ConversationStore, type Turn, trimHistory } from "../src/store";

class MemoryStore implements ConversationStore {
  data = new Map<string, Turn[]>();
  async load(userId: string) {
    return this.data.get(userId) ?? [];
  }
  async save(userId: string, turns: Turn[]) {
    this.data.set(userId, turns);
  }
  async clear(userId: string) {
    this.data.delete(userId);
  }
}

const envelope = (request: Record<string, unknown>): RequestEnvelope =>
  ({
    version: "1.0",
    session: { new: false, sessionId: "s", application: { applicationId: "skill" }, user: { userId: "u1" } },
    context: {
      System: {
        application: { applicationId: "skill" },
        user: { userId: "u1" },
        device: { deviceId: "d", supportedInterfaces: {} },
        // No apiEndpoint, so the progressive response is skipped.
      },
    },
    request: { requestId: "r", timestamp: new Date().toISOString(), locale: "en-US", ...request },
  }) as unknown as RequestEnvelope;

const chatIntent = (query?: string) =>
  envelope({
    type: "IntentRequest",
    intent: { name: "ChatIntent", confirmationStatus: "NONE", slots: { query: { name: "query", value: query } } },
  });

const speech = (res: ResponseEnvelope) => (res.response.outputSpeech as { ssml: string }).ssml;

function setup(result: ChatResult) {
  const store = new MemoryStore();
  const chat: ChatClient = { reply: vi.fn(async () => result) };
  const skill = buildSkill({ chat, store }).create();
  return { store, chat, invoke: (req: RequestEnvelope) => skill.invoke(req) };
}

describe("ChatIntent", () => {
  it("speaks Claude's reply, keeps the session open, and saves history", async () => {
    const { store, chat, invoke } = setup({ kind: "ok", text: "Canberra, as a compromise." });
    await store.save("u1", [
      { role: "user", content: "hi" },
      { role: "assistant", content: "Hello!" },
    ]);

    const res = await invoke(chatIntent("what is the capital of australia"));

    expect(speech(res)).toContain("Canberra, as a compromise.");
    expect(res.response.shouldEndSession).toBe(false);
    expect(chat.reply).toHaveBeenCalledWith([
      { role: "user", content: "hi" },
      { role: "assistant", content: "Hello!" },
      { role: "user", content: "what is the capital of australia" },
    ]);
    expect(store.data.get("u1")).toHaveLength(4);
  });

  it("does not save history when Claude times out", async () => {
    const { store, invoke } = setup({ kind: "timeout" });
    const res = await invoke(chatIntent("write a novel"));
    expect(speech(res)).toContain("took too long");
    expect(store.data.has("u1")).toBe(false);
  });

  it("reprompts on an empty query without calling Claude", async () => {
    const { chat, invoke } = setup({ kind: "ok", text: "unused" });
    const res = await invoke(chatIntent(undefined));
    expect(speech(res)).toContain("didn't catch that");
    expect(chat.reply).not.toHaveBeenCalled();
  });
});

describe("other intents", () => {
  it("clears history on new conversation", async () => {
    const { store, invoke } = setup({ kind: "ok", text: "" });
    await store.save("u1", [{ role: "user", content: "hi" }]);
    await invoke(envelope({ type: "IntentRequest", intent: { name: "NewConversationIntent", confirmationStatus: "NONE" } }));
    expect(store.data.has("u1")).toBe(false);
  });

  it("ends the session on stop", async () => {
    const { invoke } = setup({ kind: "ok", text: "" });
    const res = await invoke(envelope({ type: "IntentRequest", intent: { name: "AMAZON.StopIntent", confirmationStatus: "NONE" } }));
    expect(res.response.shouldEndSession).toBe(true);
  });
});

describe("trimHistory", () => {
  it("keeps the last N pairs and starts on a user turn", () => {
    const turns: Turn[] = Array.from({ length: 7 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: String(i),
    }));
    expect(trimHistory(turns, 2).map((t) => t.content)).toEqual(["4", "5", "6"]);
  });
});
