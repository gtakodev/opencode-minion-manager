import type { TuiPluginApi } from "@opencode-ai/plugin/tui";
import { onResize, useKeyboard, type JSX } from "@opentui/solid";

import { MANAGER_UI_COPY, PICKER_OPTIONS } from "./core/ui.js";
import type { Workflow } from "./core/types.js";

type PickerTone = (typeof PICKER_OPTIONS)[number]["tone"];

export interface ManagerWorkflowPickerProps {
  api: TuiPluginApi;
  selected: number;
  onMove: (index: number) => void;
  onSelect: (workflow: Workflow) => void | Promise<void>;
  onClose: () => void;
}

export function pickerColumnsForWidth(width: number): 2 | 4 {
  return width < 96 ? 2 : 4;
}

export function workflowColor(api: TuiPluginApi, workflow: Workflow) {
  const tone =
    PICKER_OPTIONS.find((option) => option.value === workflow)?.tone ??
    "accent";
  return themeColor(api, tone);
}

export function movePickerSelection(
  current: number,
  direction: "down" | "left" | "right" | "up",
  columns: 2 | 4,
): number {
  const delta = {
    down: columns,
    left: -1,
    right: 1,
    up: -columns,
  }[direction];
  return (current + delta + PICKER_OPTIONS.length) % PICKER_OPTIONS.length;
}

export function pickerActionForKey(
  key: string,
  current: number,
  columns: 2 | 4,
):
  | { type: "close" }
  | { type: "move"; index: number }
  | { type: "select"; workflow: Workflow }
  | undefined {
  const direction = normalizeDirection(key);
  if (direction)
    return {
      type: "move",
      index: movePickerSelection(current, direction, columns),
    };
  if (key === "return" || key === "enter") {
    const selected = PICKER_OPTIONS[current];
    return selected ? { type: "select", workflow: selected.value } : undefined;
  }
  if (key === "escape") return { type: "close" };
  return undefined;
}

export function ManagerWorkflowPicker(
  props: ManagerWorkflowPickerProps,
): JSX.Element {
  const columns = pickerColumnsForWidth(props.api.renderer.width);
  const rows = Array.from(
    { length: Math.ceil(PICKER_OPTIONS.length / columns) },
    (_, row) =>
      PICKER_OPTIONS.slice(row * columns, row * columns + columns).map(
        (option, column) => ({
          option,
          index: row * columns + column,
        }),
      ),
  );

  useKeyboard((key) => {
    const action = pickerActionForKey(key.name, props.selected, columns);
    if (!action) return;
    key.preventDefault();
    key.stopPropagation();
    if (action.type === "move") props.onMove(action.index);
    if (action.type === "select") void props.onSelect(action.workflow);
    if (action.type === "close") props.onClose();
  });
  onResize(() => props.onMove(props.selected));

  return props.api.ui.Dialog({
    onClose: props.onClose,
    children: (
      <box
        flexDirection="column"
        gap={1}
        paddingX={1}
        paddingBottom={1}
        backgroundColor={props.api.theme.current.backgroundMenu}
      >
        <box flexDirection="column">
          <text fg={props.api.theme.current.text}>
            <strong>{MANAGER_UI_COPY.pickerTitle}</strong>
          </text>
          <text fg={props.api.theme.current.textMuted}>
            {MANAGER_UI_COPY.pickerDescription}
          </text>
        </box>
        {rows.map((row) => (
          <box flexDirection="row" gap={1}>
            {row.map(({ option, index }) => (
              <WorkflowCard
                api={props.api}
                option={option}
                selected={index === props.selected}
                onFocus={() => props.onMove(index)}
                onSelect={() => void props.onSelect(option.value)}
              />
            ))}
          </box>
        ))}
        <text fg={props.api.theme.current.textMuted}>
          {MANAGER_UI_COPY.pickerHint}
        </text>
      </box>
    ),
  });
}

function WorkflowCard(props: {
  api: TuiPluginApi;
  option: (typeof PICKER_OPTIONS)[number];
  selected: boolean;
  onFocus: () => void;
  onSelect: () => void;
}): JSX.Element {
  const color = themeColor(props.api, props.option.tone);
  return (
    <box
      flexGrow={1}
      flexBasis={0}
      minWidth={16}
      height={12}
      border
      borderStyle="rounded"
      borderColor={
        props.selected ? color : props.api.theme.current.borderSubtle
      }
      backgroundColor={props.api.theme.current.backgroundPanel}
      paddingX={1}
      flexDirection="column"
      onMouseDown={() => (props.selected ? props.onSelect() : props.onFocus())}
    >
      <text fg={props.selected ? color : props.api.theme.current.textMuted}>
        {props.selected ? "•" : " "}
      </text>
      <text fg={color}>{props.option.sprite.join("\n")}</text>
      <text fg={color}>
        <strong>{props.option.label}</strong>
      </text>
      <text
        fg={
          props.selected
            ? props.api.theme.current.text
            : props.api.theme.current.textMuted
        }
        wrapMode="word"
      >
        {props.option.description}
      </text>
    </box>
  );
}

function normalizeDirection(
  key: string,
): "down" | "left" | "right" | "up" | undefined {
  if (key === "left" || key === "h") return "left";
  if (key === "right" || key === "l") return "right";
  if (key === "up" || key === "k") return "up";
  if (key === "down" || key === "j") return "down";
  return undefined;
}

function themeColor(api: TuiPluginApi, tone: PickerTone) {
  return {
    info: api.theme.current.info,
    success: api.theme.current.success,
    accent: api.theme.current.accent,
    warning: api.theme.current.warning,
  }[tone];
}
