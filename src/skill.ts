import * as Alexa from "ask-sdk-core";
import type { RequestHandler, ErrorHandler, HandlerInput } from "ask-sdk-core";
import type { ChatClient } from "./chat";
import type { ConversationStore, Turn } from "./store";
import { toSpeech } from "./speech";

export interface SkillDeps {
  chat: ChatClient;
  store: ConversationStore;
  skillId?: string;
}

const REPROMPT = "Anything else?";

const isIntent = (input: HandlerInput, ...names: string[]) =>
  Alexa.getRequestType(input.requestEnvelope) === "IntentRequest" &&
  names.includes(Alexa.getIntentName(input.requestEnvelope));

const userIdOf = (input: HandlerInput) => Alexa.getUserId(input.requestEnvelope);

/** Plays "one moment" while Claude thinks. Best effort: never blocks or fails the turn. */
async function sendProgressive(input: HandlerInput, speech: string): Promise<void> {
  try {
    const client = input.serviceClientFactory?.getDirectiveServiceClient();
    if (!client) return;
    await client.enqueue({
      header: { requestId: input.requestEnvelope.request.requestId },
      directive: { type: "VoicePlayer.Speak", speech },
    });
  } catch (err) {
    console.warn("progressive response failed", err);
  }
}

export function buildHandlers(deps: SkillDeps): { requestHandlers: RequestHandler[]; errorHandler: ErrorHandler } {
  const launch: RequestHandler = {
    canHandle: (input) => Alexa.getRequestType(input.requestEnvelope) === "LaunchRequest",
    handle: (input) =>
      input.responseBuilder
        .speak("Hi, it's Claude. What's on your mind?")
        .reprompt("What would you like to ask?")
        .getResponse(),
  };

  const chat: RequestHandler = {
    canHandle: (input) => isIntent(input, "ChatIntent"),
    async handle(input) {
      const query = Alexa.getSlotValue(input.requestEnvelope, "query")?.trim();
      if (!query) {
        return input.responseBuilder.speak("Sorry, I didn't catch that.").reprompt("What would you like to ask?").getResponse();
      }

      const userId = userIdOf(input);
      const [history] = await Promise.all([deps.store.load(userId), sendProgressive(input, "One moment.")]);
      const turns: Turn[] = [...history, { role: "user", content: query }];
      const result = await deps.chat.reply(turns);

      if (result.kind === "timeout") {
        return input.responseBuilder
          .speak("Sorry, that took too long to think through. Try asking for a shorter answer.")
          .reprompt(REPROMPT)
          .getResponse();
      }
      if (result.kind === "error") {
        console.error("chat error", result.message);
        return input.responseBuilder.speak("Sorry, I couldn't reach Claude just now.").reprompt(REPROMPT).getResponse();
      }

      await deps.store.save(userId, [...turns, { role: "assistant", content: result.text }]);
      return input.responseBuilder.speak(toSpeech(result.text)).reprompt(REPROMPT).getResponse();
    },
  };

  const newConversation: RequestHandler = {
    canHandle: (input) => isIntent(input, "NewConversationIntent", "AMAZON.StartOverIntent"),
    async handle(input) {
      await deps.store.clear(userIdOf(input));
      return input.responseBuilder.speak("Okay, starting fresh. What's up?").reprompt("What would you like to ask?").getResponse();
    },
  };

  const help: RequestHandler = {
    canHandle: (input) => isIntent(input, "AMAZON.HelpIntent"),
    handle: (input) =>
      input.responseBuilder
        .speak("Just ask me anything, and I'll pass it to Claude. Say start over to begin a new conversation, or stop to finish.")
        .reprompt("What would you like to ask?")
        .getResponse(),
  };

  const stop: RequestHandler = {
    canHandle: (input) => isIntent(input, "AMAZON.StopIntent", "AMAZON.CancelIntent", "AMAZON.NavigateHomeIntent"),
    handle: (input) => input.responseBuilder.speak("Bye.").withShouldEndSession(true).getResponse(),
  };

  const fallback: RequestHandler = {
    canHandle: (input) => isIntent(input, "AMAZON.FallbackIntent"),
    handle: (input) =>
      input.responseBuilder.speak("Sorry, I didn't catch that. Try asking again.").reprompt("What would you like to ask?").getResponse(),
  };

  const sessionEnded: RequestHandler = {
    canHandle: (input) => Alexa.getRequestType(input.requestEnvelope) === "SessionEndedRequest",
    handle: (input) => input.responseBuilder.getResponse(),
  };

  const errorHandler: ErrorHandler = {
    canHandle: () => true,
    handle(input, error) {
      console.error("unhandled skill error", error);
      return input.responseBuilder.speak("Sorry, something went wrong.").reprompt(REPROMPT).getResponse();
    },
  };

  return {
    requestHandlers: [launch, chat, newConversation, help, stop, fallback, sessionEnded],
    errorHandler,
  };
}

export function buildSkill(deps: SkillDeps) {
  const { requestHandlers, errorHandler } = buildHandlers(deps);
  const builder = Alexa.SkillBuilders.custom()
    .addRequestHandlers(...requestHandlers)
    .addErrorHandlers(errorHandler)
    .withApiClient(new Alexa.DefaultApiClient());
  if (deps.skillId) builder.withSkillId(deps.skillId);
  return builder;
}
