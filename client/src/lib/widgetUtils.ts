export type WidgetType = 'standings' | 'player-stats' | 'game-scores' | 'league-leaders';
export type WidgetLayout = 'compact' | 'standard' | 'wide';

const VALID_WIDGET_TYPES: WidgetType[] = ['standings', 'player-stats', 'game-scores', 'league-leaders'];
const VALID_LAYOUTS: WidgetLayout[] = ['compact', 'standard', 'wide'];

export interface WidgetParams {
  type: WidgetType;
  leagueId?: string;
  leagueSlug?: string;
  teamName?: string;
  playerId?: string;
  primaryColor: string;
  accentColor: string;
  bgColor: string;
  font: string;
  borderRadius: number;
  layout: WidgetLayout;
  width: number;
  height: number;
}

export const WIDGET_DEFAULTS = {
  primaryColor: '#ea580c',
  accentColor: '#f97316',
  bgColor: '#ffffff',
  font: 'Inter',
  borderRadius: 12,
  layout: 'standard' as WidgetLayout,
  width: 400,
  height: 500,
} as const;

export const LAYOUT_PRESETS: Record<WidgetLayout, { width: number; height: number }> = {
  compact: { width: 320, height: 400 },
  standard: { width: 400, height: 500 },
  wide: { width: 600, height: 400 },
};

export const FONT_OPTIONS = [
  'Inter',
  'Roboto',
  'Open Sans',
  'Montserrat',
  'Poppins',
  'Lato',
  'Source Sans Pro',
  'Oswald',
] as const;

function isValidHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

function clamp(value: number, min: number, max: number): number {
  if (isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function isValidWidgetType(value: string): value is WidgetType {
  return VALID_WIDGET_TYPES.includes(value as WidgetType);
}

function isValidLayout(value: string): value is WidgetLayout {
  return VALID_LAYOUTS.includes(value as WidgetLayout);
}

function isValidFont(value: string): boolean {
  return (FONT_OPTIONS as readonly string[]).includes(value);
}

export function parseWidgetParams(searchParams: URLSearchParams): WidgetParams {
  const rawType = searchParams.get('type') || 'standings';
  const type: WidgetType = isValidWidgetType(rawType) ? rawType : 'standings';

  const rawLayout = searchParams.get('layout') || WIDGET_DEFAULTS.layout;
  const layout: WidgetLayout = isValidLayout(rawLayout) ? rawLayout : WIDGET_DEFAULTS.layout;
  const preset = LAYOUT_PRESETS[layout];

  const rawPrimary = searchParams.get('primaryColor') || WIDGET_DEFAULTS.primaryColor;
  const rawAccent = searchParams.get('accentColor') || WIDGET_DEFAULTS.accentColor;
  const rawBg = searchParams.get('bgColor') || WIDGET_DEFAULTS.bgColor;
  const rawFont = searchParams.get('font') || WIDGET_DEFAULTS.font;

  return {
    type,
    leagueId: searchParams.get('leagueId') || undefined,
    leagueSlug: searchParams.get('leagueSlug') || undefined,
    teamName: searchParams.get('teamName') || undefined,
    playerId: searchParams.get('playerId') || undefined,
    primaryColor: isValidHexColor(rawPrimary) ? rawPrimary : WIDGET_DEFAULTS.primaryColor,
    accentColor: isValidHexColor(rawAccent) ? rawAccent : WIDGET_DEFAULTS.accentColor,
    bgColor: isValidHexColor(rawBg) ? rawBg : WIDGET_DEFAULTS.bgColor,
    font: isValidFont(rawFont) ? rawFont : WIDGET_DEFAULTS.font,
    borderRadius: clamp(parseInt(searchParams.get('borderRadius') || String(WIDGET_DEFAULTS.borderRadius), 10), 0, 24),
    layout,
    width: clamp(parseInt(searchParams.get('width') || String(preset.width), 10), 200, 1200),
    height: clamp(parseInt(searchParams.get('height') || String(preset.height), 10), 200, 1200),
  };
}

export function buildWidgetUrl(baseUrl: string, params: WidgetParams): string {
  const url = new URL(`${baseUrl}/widget/${params.type}`);
  if (params.leagueId) url.searchParams.set('leagueId', params.leagueId);
  if (params.leagueSlug) url.searchParams.set('leagueSlug', params.leagueSlug);
  if (params.teamName) url.searchParams.set('teamName', params.teamName);
  if (params.playerId) url.searchParams.set('playerId', params.playerId);
  if (params.primaryColor !== WIDGET_DEFAULTS.primaryColor) url.searchParams.set('primaryColor', params.primaryColor);
  if (params.accentColor !== WIDGET_DEFAULTS.accentColor) url.searchParams.set('accentColor', params.accentColor);
  if (params.bgColor !== WIDGET_DEFAULTS.bgColor) url.searchParams.set('bgColor', params.bgColor);
  if (params.font !== WIDGET_DEFAULTS.font) url.searchParams.set('font', params.font);
  if (params.borderRadius !== WIDGET_DEFAULTS.borderRadius) url.searchParams.set('borderRadius', String(params.borderRadius));
  if (params.layout !== WIDGET_DEFAULTS.layout) url.searchParams.set('layout', params.layout);
  if (params.width) url.searchParams.set('width', String(params.width));
  if (params.height) url.searchParams.set('height', String(params.height));
  return url.toString();
}

export function buildEmbedCode(widgetUrl: string, width: number, height: number): string {
  return `<iframe src="${widgetUrl}" width="${width}" height="${height}" frameborder="0" style="border:none;overflow:hidden;" allowtransparency="true"></iframe>`;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
    : null;
}

export function isLightColor(hex: string): boolean {
  const rgb = hexToRgb(hex);
  if (!rgb) return true;
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return luminance > 0.5;
}
