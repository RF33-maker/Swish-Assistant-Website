import { Fragment, type ReactNode } from "react";
import { Link } from "wouter";
import GameEmbed from "@/components/GameEmbed";
import { gamePath } from "@shared/seo";
import { isArticleImageSrc, isSafeArticleHref, type ArticleDoc, type ArticleNode } from "@shared/newsArticle";

/**
 * Renders an article's structured body. Built node by node from the document
 * (never from HTML), so the only markup that can appear is what's written
 * here. The editor shows the same `.sa-article` styles while typing.
 */

function ArticleLink({ href, children }: { href: string; children: ReactNode }) {
  return href.startsWith("/") ? (
    <Link href={href} className="sa-article-link">
      {children}
    </Link>
  ) : (
    <a href={href} className="sa-article-link" target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

function inline(node: ArticleNode): ReactNode[] {
  return (node.content ?? []).map((child, i) => {
    if (child.type === "hardBreak") return <br key={i} />;
    let out: ReactNode = child.text ?? "";
    for (const mark of child.marks ?? []) {
      if (mark.type === "bold") out = <strong>{out}</strong>;
      else if (mark.type === "italic") out = <em>{out}</em>;
      else if (mark.type === "link" && isSafeArticleHref(mark.attrs?.href)) out = <ArticleLink href={mark.attrs.href}>{out}</ArticleLink>;
    }
    return <Fragment key={i}>{out}</Fragment>;
  });
}

function Block({ node }: { node: ArticleNode }) {
  const children = () => (node.content ?? []).map((child, i) => <Block key={i} node={child} />);
  switch (node.type) {
    case "paragraph":
      return <p>{inline(node)}</p>;
    case "heading":
      return node.attrs?.level === 3 ? <h3>{inline(node)}</h3> : <h2>{inline(node)}</h2>;
    case "bulletList":
      return <ul>{children()}</ul>;
    case "orderedList":
      return <ol start={node.attrs?.start ?? 1}>{children()}</ol>;
    case "listItem":
      return <li>{children()}</li>;
    case "blockquote":
      return <blockquote>{children()}</blockquote>;
    case "horizontalRule":
      return <hr />;
    case "figure": {
      if (!isArticleImageSrc(node.attrs?.src)) return null;
      const { src, alt, caption, credit } = node.attrs!;
      return (
        <figure>
          <img src={src} alt={alt || ""} loading="lazy" />
          {(caption || credit) && (
            <figcaption>
              {caption}
              {credit && <span className="sa-article-credit">{caption ? " · " : ""}{credit}</span>}
            </figcaption>
          )}
        </figure>
      );
    }
    case "gameEmbed": {
      const gameKey = node.attrs?.gameKey;
      return gameKey ? <GameEmbed gameKey={gameKey} href={gamePath(node.attrs?.competitionSlug, gameKey)} /> : null;
    }
    default:
      return null;
  }
}

export default function ArticleBody({ doc }: { doc: ArticleDoc }) {
  return (
    <div className="sa-article" data-testid="text-article-body">
      {doc.content.map((node, i) => (
        <Block key={i} node={node} />
      ))}
    </div>
  );
}
