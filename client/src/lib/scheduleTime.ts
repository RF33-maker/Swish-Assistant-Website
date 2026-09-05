const UK_TIME_ZONE = "Europe/London";

export function parseScheduleTime(value: string): Date {
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}(?:\.\d+)?))?/,
  );
  if (!match) return new Date(value);

  const [, year, month, day, hour, minute, second = "0"] = match;
  const wallClockAsUtc = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Math.floor(Number(second)),
  );

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: UK_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(wallClockAsUtc));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((item) => item.type === type)?.value || 0);
  const ukWallClockAtCandidate = Date.UTC(
    part("year"),
    part("month") - 1,
    part("day"),
    part("hour"),
    part("minute"),
    part("second"),
  );

  return new Date(wallClockAsUtc - (ukWallClockAtCandidate - wallClockAsUtc));
}