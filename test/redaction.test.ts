import { describe, expect, it } from "vitest";

import { redact } from "../src/core/redaction.js";

describe("debug redaction contract", () => {
  it("redacts credential-shaped fields, bearer tokens, and configured patterns", () => {
    expect(
      redact(
        {
          authorization: "Bearer abc.def",
          nested: { apiKey: "secret", note: "token Bearer xyz private-value" },
        },
        ["private-value"],
      ),
    ).toEqual({
      authorization: "[REDACTED]",
      nested: {
        apiKey: "[REDACTED]",
        note: "token Bearer [REDACTED] [REDACTED]",
      },
    });
  });
});
