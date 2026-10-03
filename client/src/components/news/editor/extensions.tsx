import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { Trash2 } from "lucide-react";
import GameEmbed from "@/components/GameEmbed";
import { gamePath } from "@shared/seo";
import { gameEmbedLabel } from "@shared/newsArticle";

/**
 * The two article blocks that aren't plain text: an image with its caption,
 * credit and alt text, and a live game card. Both are single units in the
 * document (the caption fields edit the block's attributes, not text inside
 * it), and both match what ArticleBody renders on the public page.
 */

export interface GameEmbedAttrs {
  gameKey: string;
  competitionSlug: string | null;
  home: string;
  away: string;
  matchtime: string | null;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    figure: {
      insertFigure: (attrs: { src: string; alt?: string }) => ReturnType;
    };
    gameEmbed: {
      insertGameEmbed: (attrs: GameEmbedAttrs) => ReturnType;
    };
  }
}

const FIELD = "ch-input h-9 w-full px-3 text-[13px]";

function RemoveBlockButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-lg bg-black/65 text-white opacity-0 transition-opacity hover:bg-black/80 focus:opacity-100 group-hover:opacity-100"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}

function FigureView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const { src, alt, caption, credit } = node.attrs;
  return (
    <NodeViewWrapper as="figure" className={`group relative ${selected ? "ProseMirror-selectednode" : ""}`}>
      <div className="relative" data-drag-handle>
        <img src={src} alt={alt || ""} draggable={false} />
        <RemoveBlockButton label="Remove image" onClick={deleteNode} />
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_200px]" contentEditable={false}>
        <input
          className={FIELD}
          value={caption}
          maxLength={500}
          placeholder="Caption (optional)"
          aria-label="Image caption"
          onChange={(e) => updateAttributes({ caption: e.target.value })}
        />
        <input
          className={FIELD}
          value={credit}
          maxLength={200}
          placeholder="Photo credit"
          aria-label="Photo credit"
          onChange={(e) => updateAttributes({ credit: e.target.value })}
        />
        <input
          className={`${FIELD} sm:col-span-2`}
          value={alt}
          maxLength={300}
          placeholder="Describe the image for people who can't see it"
          aria-label="Image description (alt text)"
          onChange={(e) => updateAttributes({ alt: e.target.value })}
        />
      </div>
    </NodeViewWrapper>
  );
}

export const Figure = Node.create({
  name: "figure",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: "" },
      caption: { default: "" },
      credit: { default: "" },
    };
  },

  parseHTML() {
    return [
      {
        tag: "figure[data-article-figure]",
        getAttrs: (el) => {
          const figure = el as HTMLElement;
          return {
            src: figure.querySelector("img")?.getAttribute("src"),
            alt: figure.querySelector("img")?.getAttribute("alt") || "",
            caption: figure.getAttribute("data-caption") || "",
            credit: figure.getAttribute("data-credit") || "",
          };
        },
      },
    ];
  },

  renderHTML({ node }) {
    const { src, alt, caption, credit } = node.attrs;
    return [
      "figure",
      { "data-article-figure": "", "data-caption": caption, "data-credit": credit },
      ["img", { src, alt }],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(FigureView);
  },

  addCommands() {
    return {
      insertFigure:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    };
  },
});

function GameEmbedView({ node, deleteNode, selected }: NodeViewProps) {
  const attrs = node.attrs as GameEmbedAttrs;
  return (
    <NodeViewWrapper className={`group relative ${selected ? "ProseMirror-selectednode" : ""}`} data-drag-handle>
      {/* The card is a link on the public page; here a click selects the block instead. */}
      <div className="pointer-events-none" contentEditable={false}>
        <GameEmbed gameKey={attrs.gameKey} href={gamePath(attrs.competitionSlug, attrs.gameKey)} />
      </div>
      <RemoveBlockButton label="Remove game" onClick={deleteNode} />
    </NodeViewWrapper>
  );
}

export const GameEmbedNode = Node.create({
  name: "gameEmbed",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      gameKey: { default: null },
      competitionSlug: { default: null },
      home: { default: "" },
      away: { default: "" },
      matchtime: { default: null },
    };
  },

  parseHTML() {
    return [
      {
        tag: "div[data-game-embed]",
        getAttrs: (el) => {
          const div = el as HTMLElement;
          return {
            gameKey: div.getAttribute("data-game-embed"),
            competitionSlug: div.getAttribute("data-competition") || null,
            home: div.getAttribute("data-home") || "",
            away: div.getAttribute("data-away") || "",
            matchtime: div.getAttribute("data-matchtime") || null,
          };
        },
      },
    ];
  },

  renderHTML({ node }) {
    const attrs = node.attrs as GameEmbedAttrs;
    return [
      "div",
      mergeAttributes({
        "data-game-embed": attrs.gameKey,
        "data-competition": attrs.competitionSlug,
        "data-home": attrs.home,
        "data-away": attrs.away,
        "data-matchtime": attrs.matchtime,
      }),
      gameEmbedLabel(attrs),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(GameEmbedView);
  },

  addCommands() {
    return {
      insertGameEmbed:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    };
  },
});
