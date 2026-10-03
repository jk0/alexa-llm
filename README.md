# alexa-llm

An Alexa skill for talking to Claude. Say "Alexa, ask claude chat …" or "Alexa, open claude chat", then keep talking: the skill keeps the session open between turns.

```
Echo ──► Alexa ──► Alexa-hosted Lambda (src/, Node 16) ──► Claude Haiku 4.5 (Anthropic API)
                      │
                      ├──► DynamoDB (conversation history, table provided by Alexa-hosted)
                      └──► S3 (API key, bucket provided by Alexa-hosted)
```

- **Chat:** whatever you say goes to Claude with the recent conversation. Replies are kept short and speech-friendly.
- **Memory:** the last 10 exchanges are kept. A conversation idle for an hour starts fresh. Say "new conversation" or "start over" to reset it yourself.
- **Latency:** Alexa allows about 8 seconds per response. The skill plays "One moment" while Claude works and gives up on Claude after 6.5 seconds.
- **Privacy:** the skill stays in development mode, so only devices on your Amazon account can use it.

## Usage

The invocation name is **claude chat**. Alexa only matches it exactly, so "claude" or "claude code" won't find the skill.

| Say | What happens |
|---|---|
| "Alexa, open claude chat" | Opens the skill: "Hi, it's Claude. What's on your mind?" |
| "Alexa, ask claude chat why is the sky blue" | Asks one question; the session then stays open for follow-ups |
| *(in a session)* anything | Goes to Claude, with the conversation so far |
| "new conversation" / "start over" | Clears the history |
| "stop" / "cancel" | Ends the session |

After each answer, the Echo listens for about 8 seconds, asks "Anything else?", and listens 8 seconds more before closing. History survives the session closing: a request within the next hour continues the same conversation.

## Layout

| Path | What |
|---|---|
| `src/skill.ts` | Alexa intent handlers |
| `src/chat.ts` | Claude client and the voice system prompt |
| `src/store.ts` | DynamoDB conversation store (one item per user: `id=<userId>#CHAT`) |
| `src/apiKey.ts` | Loads the API key from the skill's S3 bucket |
| `src/speech.ts` | Converts Claude's text into safe SSML |
| `src/polyfills.ts` | Adds the `fetch` and web globals that Node 16 lacks |
| `lambda/` | Build output deployed to Alexa-hosted (`index.js` is generated) |
| `skill-package/` | Alexa interaction model (invocation name, intents) |
| `scripts/ask.ts` | Sends one question to Claude from your machine |

### Why Node 16 and pinned dependencies

Alexa-hosted skills still run Node.js 16. So:
- `npm run build` bundles everything into one `lambda/index.js` targeting Node 16.
- `src/polyfills.ts` adds the web APIs that the Anthropic SDK expects.
- `@aws-sdk/*` is pinned to `3.721.0`, the last release that supports Node 16.

Don't bump `@aws-sdk/*` unless the skill moves to a newer runtime.

## Setup

You need Node 22.12 or later on your own machine for building and testing (the skill itself runs on Node 16, as above), an [Anthropic API key](https://console.anthropic.com/settings/keys), and an [Amazon developer account](https://developer.amazon.com/alexa/console/ask) on the same Amazon login as your Echo.

1. **Check your key works:**

   ```sh
   npm install
   ANTHROPIC_API_KEY=sk-ant-... npm run ask -- "say hello in one sentence"
   ```

2. **Create the skill.** In the [Alexa developer console](https://developer.amazon.com/alexa/console/ask), click *Create Skill*. Name it *Claude* and choose English (US), then pick *Other*, then *Custom*, then *Alexa-hosted (Node.js)*. Choose hosting region *US East (N. Virginia)* and the *Start from Scratch* template.

3. **Interaction model.** On the *Build* tab, open *Interaction Model*, then *JSON Editor*. Select all of the template's JSON and replace it with `skill-package/interactionModels/custom/en-US.json` (`pbcopy < skill-package/interactionModels/custom/en-US.json` copies it). Click *Save*, then *Build skill*. Afterwards, *Invocations* should show **claude chat**, and *Intents* should list `ChatIntent` and `NewConversationIntent`, with no `HelloWorldIntent` or `FallbackIntent`.

4. **API key.** On the *Code* tab, click *Media storage* at the bottom left to open the skill's S3 bucket. Go into the `Media/` folder and upload a text file named `anthropic-api-key.txt` that contains only your key.

5. **Code.**

   ```sh
   npm run package     # builds dist/lambda.zip
   ```

   On the *Code* tab, click *Import Code*, choose `dist/lambda.zip`, import all files, then click *Deploy*.

6. **Test.** On the *Test* tab, set *Skill testing* to *Development* and type or say "ask claude chat why is the sky blue". It now works on your Echo too.

Logs are under *Code*, then *CloudWatch Logs* (choose the US East region).

**Which button ships what:**
- **Build skill** (Build tab) ships interaction-model changes.
- **Deploy** (Code tab) ships code changes.

### Troubleshooting

| Alexa says | Cause |
|---|---|
| "I'm not quite sure how to help you with that." | Alexa didn't route to the skill. Check that you said "claude chat", that *Test* is set to *Development*, and that the locale is English (US). |
| "Sorry, I didn't catch that. Try asking again." | The template's interaction model is still active, so `FallbackIntent` caught the request. Redo step 3. |
| "Sorry, I couldn't reach Claude just now." | API key problem. Check `Media/anthropic-api-key.txt` and the CloudWatch logs. Unscoped keys fail with an `anthropic-workspace-id` error, so create the key inside a workspace. |
| "Sorry, that took too long to think through." | Claude took longer than 6.5 seconds. Ask for a shorter answer. |

## Configuration

Alexa-hosted skills can't set custom environment variables, so the defaults in `src/config.ts` are the live settings. Edit them and redeploy:

| Setting | Default | |
|---|---|---|
| `model` | `claude-haiku-4-5` | `claude-sonnet-5-5` gives better but slower answers |
| `maxTokens` | 400 | spoken answers are short |
| `claudeTimeoutMs` | 6500 | must leave room inside Alexa's ~8s limit |
| `conversationIdleMinutes` | 60 | |
| `maxHistoryTurns` | 10 | |

## Development

```sh
npm test            # unit tests (handlers run against fakes; no network calls)
npm run typecheck
npm run package     # build dist/lambda.zip for Import Code
```

## Cost

Alexa-hosted hosting is free within its usage limits. You pay only for Claude tokens: about $1–2 a month at 20 exchanges a day on Haiku 4.5 ($1 / $5 per million input / output tokens).

## Roadmap

- **Claude Code tasks:** "Alexa, ask claude chat to fix the failing tests in alexa-llm." The skill fires a Claude Code [routine](https://code.claude.com/docs/en/routines) API trigger, and a later turn reads back the result.
  - Alexa-hosted can't receive webhooks, so the routine needs to put its summary somewhere the skill can read, such as a GitHub comment or PR.
  - Alternatively, move the backend to your own AWS account, where a Lambda URL can receive the routine's webhook.
