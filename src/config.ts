const intFromEnv = (name: string, fallback: number): number => {
  const raw = process.env[name];
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
};

// Alexa-hosted skills can't set custom environment variables; the defaults below are the real
// settings there. The env overrides exist for local runs and tests.
export const config = {
  // Provided by Alexa-hosted skills.
  tableName: process.env.DYNAMODB_PERSISTENCE_TABLE_NAME ?? "",
  tableRegion: process.env.DYNAMODB_PERSISTENCE_REGION,
  bucketName: process.env.S3_PERSISTENCE_BUCKET ?? "",
  bucketRegion: process.env.S3_PERSISTENCE_REGION,
  // Object in the skill's S3 bucket holding the Anthropic API key (Code tab > Media storage).
  apiKeyObject: process.env.API_KEY_OBJECT ?? "Media/anthropic-api-key.txt",

  skillId: process.env.SKILL_ID,
  model: process.env.CLAUDE_MODEL ?? "claude-haiku-4-5",
  maxTokens: intFromEnv("MAX_TOKENS", 400),
  // Alexa abandons the request after ~8s; leave headroom for DynamoDB and the response.
  claudeTimeoutMs: intFromEnv("CLAUDE_TIMEOUT_MS", 6500),
  // A conversation idle longer than this starts fresh.
  conversationIdleMinutes: intFromEnv("CONVERSATION_IDLE_MINUTES", 60),
  maxHistoryTurns: intFromEnv("MAX_HISTORY_TURNS", 10),
};
