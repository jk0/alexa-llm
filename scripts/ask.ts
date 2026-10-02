// Sends one question to Claude using the same client, prompt, and timeout as the skill.
// Usage: ANTHROPIC_API_KEY=sk-ant-... npm run ask -- "why is the sky blue"
import { AnthropicChatClient } from "../src/chat";
import { toSpeech } from "../src/speech";

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Set ANTHROPIC_API_KEY first, e.g.\n  ANTHROPIC_API_KEY=sk-ant-... npm run ask -- "hello world"');
  process.exit(1);
}

const question =process.argv.slice(2).join(" ") || "Say hello in one sentence.";
const started = Date.now();
const result = await new AnthropicChatClient().reply([{ role: "user", content: question }]);
console.log(JSON.stringify(result, null, 2));
if (result.kind === "ok") console.log("\nspoken:", toSpeech(result.text));
console.log(`\n${Date.now() - started} ms`);
