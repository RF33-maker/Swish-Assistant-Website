export interface PlaybookData {
  title: string;
  intro?: string;
  sections: unknown[];
}
export interface PlaybookSaveError { code?: "conflict" | "readonly"; message?: string }
export interface PlaybookOptions {
  initial?: PlaybookData | null;
  /** Resolve when saved; reject with a PlaybookSaveError to explain why not. */
  save?: (data: PlaybookData) => Promise<void>;
  draftKey?: string;
  download?: (filename: string, text: string) => void;
  barMode?: "fixed" | "sticky";
  idleStatus?: string;
  /** false starts view-only (no edit bar). Default true. */
  editable?: boolean;
}
export interface PlaybookHandle {
  getState(): PlaybookData;
  isDirty(): boolean;
  setStatus(text: string): void;
  setEditable(editable: boolean): void;
  destroy(): void;
}
export function createPlaybook(root: HTMLElement, options?: PlaybookOptions): PlaybookHandle;
export function pbBlankPlaybook(title?: string): PlaybookData;
export function pbBlankPlay(title?: string): unknown;
