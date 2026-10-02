import "./polyfills";
import { AnthropicChatClient } from "./chat";
import { config } from "./config";
import { buildSkill } from "./skill";
import { DynamoConversationStore } from "./store";

process.setSourceMapsEnabled?.(true);

export const handler = buildSkill({
  chat: new AnthropicChatClient(),
  store: new DynamoConversationStore(),
  skillId: config.skillId,
}).lambda();
