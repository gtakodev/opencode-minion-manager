import { describe, expect, it } from "vitest";

import {
  permissionsFor,
  requiresWriteEscalation,
} from "../src/core/permissions.js";

const host = { read: true, web: true, shell: true, edit: true };

describe("permission contract", () => {
  it("keeps Manager coordination-only and minions least-privileged", () => {
    expect(permissionsFor("Manager", host)).toEqual({
      read: true,
      web: false,
      shell: false,
      edit: false,
      delegate: true,
    });
    expect(permissionsFor("minion/review", host)).toMatchObject({
      edit: false,
      shell: false,
      delegate: false,
    });
    expect(permissionsFor("minion/implement", host)).toMatchObject({
      edit: true,
      shell: true,
      delegate: false,
    });
  });

  it("never elevates permissions denied by the host", () => {
    expect(
      permissionsFor("minion/implement", {
        read: true,
        web: false,
        shell: false,
        edit: false,
      }),
    ).toMatchObject({ edit: false, shell: false });
    expect(permissionsFor("minion/report", host)).toMatchObject({
      edit: false,
    });
    expect(
      permissionsFor("minion/report", host, "docs/report.md"),
    ).toMatchObject({ edit: true, reportDestination: "docs/report.md" });
  });

  it("requires approval for read-only to write escalation", () => {
    expect(requiresWriteEscalation("review", "implement")).toBe(true);
    expect(requiresWriteEscalation("research", "implement")).toBe(true);
    expect(requiresWriteEscalation("implement", "implement")).toBe(false);
  });
});
