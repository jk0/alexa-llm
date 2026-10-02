import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { config } from "./config";

let cached: Promise<string> | undefined;

/**
 * The Anthropic API key. Locally it comes from ANTHROPIC_API_KEY; on Alexa-hosted (no custom
 * env vars) it's read once per container from the skill's S3 bucket, so it never lives in git.
 */
export function getApiKey(): Promise<string> {
  if (process.env.ANTHROPIC_API_KEY) return Promise.resolve(process.env.ANTHROPIC_API_KEY);
  cached ??= readFromS3().catch((err) => {
    cached = undefined; // let the next request retry
    throw err;
  });
  return cached;
}

async function readFromS3(): Promise<string> {
  if (!config.bucketName) throw new Error("No ANTHROPIC_API_KEY and no S3_PERSISTENCE_BUCKET");
  const s3 = new S3Client({ region: config.bucketRegion });
  const res = await s3.send(new GetObjectCommand({ Bucket: config.bucketName, Key: config.apiKeyObject }));
  const key = (await res.Body?.transformToString())?.trim();
  if (!key) throw new Error(`API key object ${config.apiKeyObject} is empty`);
  return key;
}
