import { useEffect, useRef } from "react";
import { type WidgetParams, isLightColor, WIDGET_RESIZE_MESSAGE_TYPE } from "@/lib/widgetUtils";

interface WidgetLayoutProps {
  params: WidgetParams;
  children: React.ReactNode;
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  emptyMessage?: string;
}

const loadedFonts = new Set<string>();

function ensureFontLoaded(font: string) {
  if (typeof document === 'undefined') return;
  if (loadedFonts.has(font)) return;
  loadedFonts.add(font);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${font.replace(/ /g, '+')}:wght@400;500;600;700&display=swap`;
  document.head.appendChild(link);
}

function Skeleton({ width, height, color }: { width: string; height: string; color: string }) {
  return (
    <div
      style={{
        width,
        height,
        backgroundColor: color,
        borderRadius: '6px',
        animation: 'swish-widget-pulse 1.4s ease-in-out infinite',
      }}
    />
  );
}

export default function WidgetLayout({ params, children, loading, error, empty, emptyMessage }: WidgetLayoutProps) {
  const bgColor = params.bgColor || '#ffffff';
  const primaryColor = params.primaryColor || '#ea580c';
  const font = params.font || 'Inter';
  const borderRadius = params.borderRadius ?? 12;
  const light = isLightColor(bgColor);
  const textColor = light ? '#1e293b' : '#f8fafc';
  const subtextColor = light ? '#64748b' : '#94a3b8';
  const skeletonColor = light ? '#e2e8f0' : '#334155';

  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    ensureFontLoaded(font);
  }, [font]);

  useEffect(() => {
    if (typeof window === 'undefined' || window.parent === window) return;
    const el = containerRef.current;
    if (!el) return;

    let lastSent = -1;
    const send = () => {
      const h = el.scrollHeight;
      if (h === lastSent || h <= 0) return;
      lastSent = h;
      window.parent.postMessage({ type: WIDGET_RESIZE_MESSAGE_TYPE, height: h }, '*');
    };

    send();
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => send());
      ro.observe(el);
    }
    const intervalId = window.setInterval(send, 1500);

    return () => {
      if (ro) ro.disconnect();
      window.clearInterval(intervalId);
    };
  }, [loading, error, empty, children]);

  const style: React.CSSProperties = {
    backgroundColor: bgColor,
    color: textColor,
    fontFamily: `'${font}', system-ui, sans-serif`,
    borderRadius: `${borderRadius}px`,
    width: '100%',
    padding: '16px',
    boxSizing: 'border-box',
  };

  let body: React.ReactNode;
  if (loading) {
    body = (
      <div data-testid="widget-skeleton" className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Skeleton width="8px" height="20px" color={primaryColor} />
          <Skeleton width="60%" height="16px" color={skeletonColor} />
        </div>
        <Skeleton width="35%" height="10px" color={skeletonColor} />
        <div className="flex flex-col gap-2 mt-2">
          {[0, 1, 2, 3, 4].map(i => (
            <Skeleton key={i} width="100%" height="22px" color={skeletonColor} />
          ))}
        </div>
        <span className="sr-only" style={{ color: subtextColor }}>Loading…</span>
      </div>
    );
  } else if (error) {
    body = (
      <div className="flex items-center justify-center py-6" data-testid="widget-error">
        <div className="text-center">
          <p style={{ color: '#ef4444', fontSize: '14px', fontWeight: 600 }}>Unable to load widget</p>
          <p style={{ color: subtextColor, fontSize: '13px', marginTop: '4px' }}>{error}</p>
        </div>
      </div>
    );
  } else if (empty) {
    body = (
      <div className="flex items-center justify-center py-6" data-testid="widget-empty">
        <div className="text-center">
          <p style={{ color: textColor, fontSize: '14px', fontWeight: 600 }}>Nothing to show yet</p>
          <p style={{ color: subtextColor, fontSize: '12px', marginTop: '4px' }}>
            {emptyMessage || 'Check back once games have been played.'}
          </p>
        </div>
      </div>
    );
  } else {
    body = children;
  }

  return (
    <div ref={containerRef} style={style} data-testid="widget-root">
      <style>{`@keyframes swish-widget-pulse { 0%, 100% { opacity: 0.55; } 50% { opacity: 1; } }`}</style>
      {body}
    </div>
  );
}
