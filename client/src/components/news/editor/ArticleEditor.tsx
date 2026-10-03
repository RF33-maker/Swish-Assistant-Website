import { useEffect, useRef, useState, type ReactNode } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  CalendarDays,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Loader2,
  Minus,
  Quote,
  Redo2,
  Undo2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { isImageFile, uploadNewsImage } from "@/lib/newsArticles";
import { isSafeArticleHref, type ArticleDoc } from "@shared/newsArticle";
import { Figure, GameEmbedNode } from "./extensions";
import GamePickerDialog from "./GamePickerDialog";
import type { PickedGame } from "./tagSearch";

/**
 * The article body editor: a toolbar over a Tiptap document styled exactly
 * like the published article (`.sa-article`). It holds its own document and
 * reports each change as JSON; the page around it owns saving.
 */

function ToolButton({
  label,
  active = false,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      // Keep the text selection in the editor when a button is pressed.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`flex h-9 min-w-9 shrink-0 items-center justify-center gap-1.5 rounded-lg px-2 text-[13px] font-medium transition-colors disabled:opacity-40 ${
        active
          ? "bg-[color:var(--ch-text)] text-[color:var(--ch-surface)]"
          : "text-[color:var(--ch-text-2)] hover:bg-[color:var(--ch-surface-3)] hover:text-[color:var(--ch-text)]"
      }`}
    >
      {children}
    </button>
  );
}

const Divider = () => <span className="mx-1 h-5 w-px shrink-0 bg-[color:var(--ch-border-strong)]" aria-hidden />;

/** "example.com/page" → "https://example.com/page"; site paths and full URLs are left alone. */
function normaliseHref(input: string): string {
  const value = input.trim();
  if (!value || value.startsWith("/") || /^[a-z][a-z0-9+.-]*:/i.test(value)) return value;
  return value.includes("@") && !value.includes("/") ? `mailto:${value}` : `https://${value}`;
}

/** Places an image or game block, leaving a paragraph after it when it lands at the end. */
function insertBlock(editor: Editor, node: { type: string; attrs: Record<string, any> }) {
  editor.chain().focus().insertContent(node).run();
  if (editor.state.doc.lastChild?.type.name === node.type) {
    editor.commands.insertContentAt(editor.state.doc.content.size, { type: "paragraph" });
  }
}

export default function ArticleEditor({
  initialContent,
  onChange,
  onGamePicked,
  toolbarClassName = "",
}: {
  initialContent: ArticleDoc;
  onChange: (doc: ArticleDoc) => void;
  /** Called after a game card is placed, so the page can tag the article with it. */
  onGamePicked: (game: PickedGame) => void;
  toolbarClassName?: string;
}) {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [gamePickerOpen, setGamePickerOpen] = useState(false);
  const [linkDraft, setLinkDraft] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);
  // The editor's handlers are created once with it, so they reach the
  // current upload function and onChange through refs.
  const addImagesRef = useRef<(files: File[]) => void>(() => {});
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] }, code: false, codeBlock: false, strike: false }),
      Link.configure({ openOnClick: false, autolink: true, linkOnPaste: true, HTMLAttributes: { class: "sa-article-link" } }),
      Placeholder.configure({ placeholder: "Tell the story…" }),
      Figure,
      GameEmbedNode,
    ],
    content: initialContent,
    editorProps: {
      attributes: { class: "sa-article", "aria-label": "Article body" },
      handlePaste: (_view, event) => {
        const images = Array.from(event.clipboardData?.files ?? []).filter(isImageFile);
        if (!images.length) return false;
        addImagesRef.current(images);
        return true;
      },
      handleDrop: (_view, event) => {
        const images = Array.from(event.dataTransfer?.files ?? []).filter(isImageFile);
        if (!images.length) return false;
        event.preventDefault();
        addImagesRef.current(images);
        return true;
      },
    },
    onUpdate: ({ editor }) => onChangeRef.current(editor.getJSON() as ArticleDoc),
  });

  addImagesRef.current = async (files: File[]) => {
    if (!editor) return;
    setUploading(true);
    try {
      for (const file of files) {
        const src = await uploadNewsImage(file, "articles/inline");
        insertBlock(editor, { type: "figure", attrs: { src } });
      }
    } catch (err: any) {
      toast({ title: "Image not added", description: err?.message || "The image couldn't be uploaded.", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    if (linkDraft !== null) linkInputRef.current?.focus();
  }, [linkDraft !== null]);

  if (!editor) return null;

  const applyLink = () => {
    const href = normaliseHref(linkDraft ?? "");
    if (!href) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else if (!isSafeArticleHref(href)) {
      toast({ title: "That link won't work", description: "Use a full web address, like https://example.com.", variant: "destructive" });
      return;
    } else if (editor.state.selection.empty && !editor.isActive("link")) {
      editor.chain().focus().insertContent({ type: "text", text: href, marks: [{ type: "link", attrs: { href } }] }).run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }
    setLinkDraft(null);
  };

  const pickGame = (game: PickedGame) => {
    insertBlock(editor, {
      type: "gameEmbed",
      attrs: { gameKey: game.gameKey, competitionSlug: game.competitionSlug, home: game.home, away: game.away, matchtime: game.matchtime },
    });
    onGamePicked(game);
  };

  return (
    <div>
      {/* Stays in view while writing. The band behind the toolbar is the page
          colour, so text scrolling up disappears under it cleanly. */}
      <div className={`sticky z-20 mb-3 bg-[color:var(--ch-surface)] py-2 ${toolbarClassName}`}>
        <div className="-mx-2 rounded-xl border border-[color:var(--ch-border)] bg-[color:var(--ch-surface)] shadow-[var(--ch-shadow)]">
          <div className="flex items-center gap-0.5 overflow-x-auto p-1.5" role="toolbar" aria-label="Formatting">
            <ToolButton label="Heading" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
              <Heading2 className="h-[18px] w-[18px]" />
            </ToolButton>
            <ToolButton label="Subheading" active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
              <Heading3 className="h-[18px] w-[18px]" />
            </ToolButton>
            <Divider />
            <ToolButton label="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
              <Bold className="h-4 w-4" />
            </ToolButton>
            <ToolButton label="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
              <Italic className="h-4 w-4" />
            </ToolButton>
            <ToolButton
              label="Link"
              active={editor.isActive("link") || linkDraft !== null}
              onClick={() => setLinkDraft(linkDraft === null ? (editor.getAttributes("link").href ?? "") : null)}
            >
              <Link2 className="h-4 w-4" />
            </ToolButton>
            <Divider />
            <ToolButton label="Bulleted list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
              <List className="h-4 w-4" />
            </ToolButton>
            <ToolButton label="Numbered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
              <ListOrdered className="h-4 w-4" />
            </ToolButton>
            <ToolButton label="Quote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
              <Quote className="h-4 w-4" />
            </ToolButton>
            <ToolButton label="Divider" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
              <Minus className="h-4 w-4" />
            </ToolButton>
            <Divider />
            <ToolButton label="Add an image" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
              <span>Image</span>
            </ToolButton>
            <ToolButton label="Add a game" onClick={() => setGamePickerOpen(true)}>
              <CalendarDays className="h-4 w-4" />
              <span>Game</span>
            </ToolButton>
            <span className="flex-1" />
            <ToolButton label="Undo" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}>
              <Undo2 className="h-4 w-4" />
            </ToolButton>
            <ToolButton label="Redo" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}>
              <Redo2 className="h-4 w-4" />
            </ToolButton>
          </div>

          {linkDraft !== null && (
            <form
              className="flex items-center gap-2 border-t border-[color:var(--ch-border)] p-2"
              onSubmit={(e) => {
                e.preventDefault();
                applyLink();
              }}
            >
              <input
                ref={linkInputRef}
                className="ch-input h-9 min-w-0 flex-1 px-3 text-[14px]"
                value={linkDraft}
                placeholder="Paste a link, or a page on this site like /news"
                aria-label="Link address"
                onChange={(e) => setLinkDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setLinkDraft(null);
                }}
              />
              <button type="submit" className="ch-btn ch-btn-primary h-9">
                Apply
              </button>
              {editor.isActive("link") && (
                <button
                  type="button"
                  className="ch-btn ch-btn-ghost h-9"
                  onClick={() => {
                    editor.chain().focus().extendMarkRange("link").unsetLink().run();
                    setLinkDraft(null);
                  }}
                >
                  Remove
                </button>
              )}
            </form>
          )}
        </div>
      </div>

      <EditorContent editor={editor} data-testid="editor-body" />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) addImagesRef.current(files);
        }}
        data-testid="input-inline-image"
      />
      <GamePickerDialog open={gamePickerOpen} onOpenChange={setGamePickerOpen} onPick={pickGame} />
    </div>
  );
}
