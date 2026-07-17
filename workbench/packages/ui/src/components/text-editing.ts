export type TextEditKey = {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  isComposing?: boolean;
};

export function isTextEditSaveShortcut(event: TextEditKey): boolean {
  return !event.isComposing && event.key === "Enter" && (event.ctrlKey === true || event.metaKey === true);
}

export function isTextEditCancelShortcut(event: TextEditKey): boolean {
  return !event.isComposing && event.key === "Escape";
}

export function hasTextDraftChanged(original: string | undefined, draft: string): boolean {
  return (original ?? "") !== draft;
}
