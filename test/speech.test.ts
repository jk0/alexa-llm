import { describe, expect, it } from "vitest";
import { toSpeech } from "../src/speech";

describe("toSpeech", () => {
  it("strips markdown", () => {
    expect(toSpeech("## Title\n- **bold** item\n- see [docs](https://x.y)")).toBe("Title bold item see docs");
  });

  it("drops code blocks and unwraps inline code", () => {
    expect(toSpeech("Run `npm test`.\n```\nrm -rf /\n```\nDone.")).toBe("Run npm test. Done.");
  });

  it("escapes SSML special characters", () => {
    expect(toSpeech("salt & pepper <3")).toBe("salt &amp; pepper &lt;3");
  });

  it("truncates long text at a sentence boundary", () => {
    const out = toSpeech("This is a sentence. ".repeat(500));
    expect(out.length).toBeLessThanOrEqual(6000);
    expect(out.endsWith(".")).toBe(true);
  });
});
