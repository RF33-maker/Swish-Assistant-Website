import { type WidgetParams, isLightColor } from "@/lib/widgetUtils";

interface WidgetLayoutProps {
  params: WidgetParams;
  children: React.ReactNode;
  loading?: boolean;
  error?: string | null;
}

export default function WidgetLayout({ params, children, loading, error }: WidgetLayoutProps) {
  const bgColor = params.bgColor || '#ffffff';
  const primaryColor = params.primaryColor || '#ea580c';
  const font = params.font || 'Inter';
  const borderRadius = params.borderRadius ?? 12;
  const textColor = isLightColor(bgColor) ? '#1e293b' : '#f8fafc';
  const subtextColor = isLightColor(bgColor) ? '#64748b' : '#94a3b8';

  const style: React.CSSProperties = {
    backgroundColor: bgColor,
    color: textColor,
    fontFamily: `'${font}', system-ui, sans-serif`,
    borderRadius: `${borderRadius}px`,
    width: '100%',
    height: '100%',
    overflow: 'auto',
    padding: '16px',
    boxSizing: 'border-box',
  };

  if (loading) {
    return (
      <div style={style} className="flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div
            className="animate-spin rounded-full h-8 w-8 border-2 border-transparent"
            style={{ borderTopColor: primaryColor, borderRightColor: primaryColor }}
          />
          <span style={{ color: subtextColor, fontSize: '13px' }}>Loading...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={style} className="flex items-center justify-center">
        <div className="text-center">
          <p style={{ color: '#ef4444', fontSize: '14px', fontWeight: 600 }}>Error</p>
          <p style={{ color: subtextColor, fontSize: '13px', marginTop: '4px' }}>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={style}>
      <link
        href={`https://fonts.googleapis.com/css2?family=${font.replace(/ /g, '+')}:wght@400;500;600;700&display=swap`}
        rel="stylesheet"
      />
      {children}
    </div>
  );
}
