export type EditorShortcutAction = "undo" | "redo" | "toggle-playback";

export function editorShortcutAction(input: {
  key: string;
  code?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
}): EditorShortcutAction | null {
  const command = input.ctrlKey || input.metaKey;
  if (command && input.key.toLowerCase() === "z") return input.shiftKey ? "redo" : "undo";
  if (command && input.key.toLowerCase() === "y") return "redo";
  if (input.code === "Space") return "toggle-playback";
  return null;
}
