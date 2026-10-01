import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from "react";
import { useLocation } from "wouter";

/**
 * A real link to a player, team or game page.
 *
 * Search engines only follow <a href>, so names and game rows that used to
 * navigate with an onClick were invisible to them as links. This renders the
 * canonical URL as the href (what Google and "open in new tab" use) while a
 * plain click keeps the in-page behaviour — e.g. the league page opening a
 * player inline — via `onNavigate`. Without onNavigate it navigates in-app.
 *
 * Clicks never bubble to a surrounding clickable row, so a row's own onClick
 * doesn't fire a second navigation.
 */
export default function EntityLink({
  href,
  onNavigate,
  children,
  className = "",
  ...rest
}: {
  href: string | null | undefined;
  onNavigate?: () => void;
  children: ReactNode;
  className?: string;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "onClick">) {
  const [, navigate] = useLocation();
  if (!href) return <span className={className}>{children}</span>;
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    e.stopPropagation();
    // Cmd/Ctrl/Shift-click and middle-click: let the browser open the URL.
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (onNavigate) onNavigate();
    else navigate(href);
  };
  return (
    <a href={href} onClick={onClick} className={className} {...rest}>
      {children}
    </a>
  );
}
