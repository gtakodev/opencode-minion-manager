import { describe, expect, it, vi } from "vitest";

import {
  ManagerWorkflowPicker,
  movePickerSelection,
  pickerActionForKey,
  pickerColumnsForWidth,
  workflowColor,
} from "../src/tui-picker.js";

describe("visual workflow picker", () => {
  it("uses four columns normally and a 2×2 layout in narrow terminals", () => {
    expect(pickerColumnsForWidth(120)).toBe(4);
    expect(pickerColumnsForWidth(95)).toBe(2);
  });

  it("wraps directional navigation across all workflow cards", () => {
    expect(movePickerSelection(0, "left", 4)).toBe(3);
    expect(movePickerSelection(3, "right", 4)).toBe(0);
    expect(movePickerSelection(0, "down", 2)).toBe(2);
    expect(movePickerSelection(1, "up", 2)).toBe(3);
  });

  it("exports the production picker component", () => {
    expect(ManagerWorkflowPicker).toBeTypeOf("function");
    expect(vi.isMockFunction(ManagerWorkflowPicker)).toBe(false);
  });

  it("maps native key names to movement, selection, and close actions", () => {
    expect(pickerActionForKey("right", 0, 4)).toEqual({
      type: "move",
      index: 1,
    });
    expect(pickerActionForKey("return", 2, 4)).toEqual({
      type: "select",
      workflow: "review",
    });
    expect(pickerActionForKey("escape", 2, 4)).toEqual({ type: "close" });
    expect(pickerActionForKey("x", 2, 4)).toBeUndefined();
  });

  it("uses the same workflow colors as the picker metadata", () => {
    const api = {
      theme: {
        current: {
          info: "blue",
          success: "green",
          accent: "purple",
          warning: "yellow",
        },
      },
    } as never;
    expect(workflowColor(api, "auto")).toBe("blue");
    expect(workflowColor(api, "implement")).toBe("green");
    expect(workflowColor(api, "review")).toBe("purple");
    expect(workflowColor(api, "research")).toBe("yellow");
  });
});
