import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import type Anthropic from "@anthropic-ai/sdk";
import { config } from "./config";

export type Turn = Anthropic.MessageParam & { content: string };

export interface ConversationStore {
  load(userId: string): Promise<Turn[]>;
  save(userId: string, turns: Turn[]): Promise<void>;
  clear(userId: string): Promise<void>;
}

/** Keeps the last `maxTurns` user/assistant pairs, always starting on a user turn. */
export function trimHistory(turns: Turn[], maxTurns: number): Turn[] {
  const trimmed = turns.slice(-maxTurns * 2);
  const firstUser = trimmed.findIndex((t) => t.role === "user");
  return firstUser === -1 ? [] : trimmed.slice(firstUser);
}

// The Alexa-hosted table has a single string partition key, `id`. Items are namespaced so
// later features (e.g. Claude Code task summaries) can share it: <alexa user id>#CHAT, #TASK#<id>, ...
const key = (userId: string) => ({ id: `${userId}#CHAT` });

export class DynamoConversationStore implements ConversationStore {
  constructor(
    private readonly doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region: config.tableRegion })),
    private readonly tableName = config.tableName,
  ) {}

  async load(userId: string): Promise<Turn[]> {
    const { Item } = await this.doc.send(new GetCommand({ TableName: this.tableName, Key: key(userId) }));
    if (!Item) return [];
    const idleMs = Date.now() - Number(Item.updatedAt ?? 0);
    if (idleMs > config.conversationIdleMinutes * 60_000) return [];
    return (Item.turns as Turn[] | undefined) ?? [];
  }

  async save(userId: string, turns: Turn[]): Promise<void> {
    await this.doc.send(
      new PutCommand({
        TableName: this.tableName,
        Item: { ...key(userId), turns: trimHistory(turns, config.maxHistoryTurns), updatedAt: Date.now() },
      }),
    );
  }

  async clear(userId: string): Promise<void> {
    await this.doc.send(new DeleteCommand({ TableName: this.tableName, Key: key(userId) }));
  }
}
