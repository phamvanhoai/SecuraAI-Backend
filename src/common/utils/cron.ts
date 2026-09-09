import { AppError } from '@/common/errors/app-error.js';

export type ParsedField = {
  matches: (val: number) => boolean;
  isWildcard: boolean;
};

export type ParsedCron = {
  minutes: ParsedField;
  hours: ParsedField;
  daysOfMonth: ParsedField;
  months: ParsedField;
  daysOfWeek: ParsedField;
};

const CRON_ALIASES: Record<string, string> = {
  '@hourly': '0 * * * *',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@weekly': '0 0 * * 0',
  '@monthly': '0 0 1 * *',
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
};

function parseRangeOrNumber(
  part: string,
  min: number,
  max: number,
  normalizeDow = false,
): { values: number[] } {
  const stepSplit = part.split('/');
  if (stepSplit.length > 2) {
    throw new Error(`Invalid step syntax: ${part}`);
  }

  const rangePart = stepSplit[0]?.trim();
  const stepStr = stepSplit[1]?.trim();
  let step = 1;

  if (stepStr !== undefined) {
    step = Number.parseInt(stepStr, 10);
    if (Number.isNaN(step) || step <= 0) {
      throw new Error(`Invalid step value: ${stepStr}`);
    }
  }

  let start = min;
  let end = max;

  if (!rangePart || rangePart === '*') {
    start = min;
    end = max;
  } else if (rangePart.includes('-')) {
    const dashSplit = rangePart.split('-');
    if (dashSplit.length !== 2) {
      throw new Error(`Invalid range syntax: ${rangePart}`);
    }
    start = Number.parseInt(dashSplit[0]!.trim(), 10);
    end = Number.parseInt(dashSplit[1]!.trim(), 10);
    if (Number.isNaN(start) || Number.isNaN(end) || start > end || start < min || end > max) {
      throw new Error(`Range ${rangePart} out of bounds (${min}-${max})`);
    }
  } else {
    const num = Number.parseInt(rangePart, 10);
    if (Number.isNaN(num)) {
      throw new Error(`Invalid number: ${rangePart}`);
    }
    if (normalizeDow && num === 7) {
      start = 0;
      end = 0;
    } else if (num < min || num > max) {
      throw new Error(`Value ${num} out of bounds (${min}-${max})`);
    } else {
      start = num;
      end = stepStr !== undefined ? max : num;
    }
  }

  const values: number[] = [];
  for (let i = start; i <= end; i += step) {
    const v = normalizeDow && i === 7 ? 0 : i;
    values.push(v);
  }
  return { values };
}

function parseField(
  rawField: string,
  min: number,
  max: number,
  normalizeDow = false,
): ParsedField {
  const trimmed = rawField.trim();
  if (!trimmed) {
    throw new Error('Empty cron field');
  }

  if (trimmed === '*') {
    return {
      matches: () => true,
      isWildcard: true,
    };
  }

  const parts = trimmed.split(',');
  const allowedSet = new Set<number>();

  for (const part of parts) {
    const { values } = parseRangeOrNumber(part.trim(), min, max, normalizeDow);
    for (const v of values) {
      allowedSet.add(v);
    }
  }

  return {
    matches: (val: number) => allowedSet.has(val),
    isWildcard: false,
  };
}

export function parseCronExpression(expression: string): ParsedCron {
  const trimmed = expression.trim().toLowerCase();
  const normalized = CRON_ALIASES[trimmed] ?? trimmed;

  const fields = normalized.split(/\s+/);
  if (fields.length !== 5) {
    throw new AppError(
      400,
      'INVALID_CRON_EXPRESSION',
      `Cron expression must have exactly 5 fields (received ${fields.length}): "${expression}"`,
    );
  }

  try {
    const minutes = parseField(fields[0]!, 0, 59);
    const hours = parseField(fields[1]!, 0, 23);
    const daysOfMonth = parseField(fields[2]!, 1, 31);
    const months = parseField(fields[3]!, 1, 12);
    const daysOfWeek = parseField(fields[4]!, 0, 7, true);

    return { minutes, hours, daysOfMonth, months, daysOfWeek };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Syntax error in cron expression';
    throw new AppError(400, 'INVALID_CRON_EXPRESSION', `Invalid cron expression "${expression}": ${msg}`);
  }
}

export function isValidCronExpression(expression: string): boolean {
  try {
    parseCronExpression(expression);
    return true;
  } catch {
    return false;
  }
}

function matchesDate(parsed: ParsedCron, date: Date): boolean {
  const minute = date.getUTCMinutes();
  const hour = date.getUTCHours();
  const dom = date.getUTCDate();
  const month = date.getUTCMonth() + 1; // 1-12
  const dow = date.getUTCDay(); // 0-6 (0=Sun)

  if (!parsed.minutes.matches(minute)) return false;
  if (!parsed.hours.matches(hour)) return false;
  if (!parsed.months.matches(month)) return false;

  // Standard POSIX matching rule for Day of Month and Day of Week
  const domMatch = parsed.daysOfMonth.matches(dom);
  const dowMatch = parsed.daysOfWeek.matches(dow);

  if (parsed.daysOfMonth.isWildcard && parsed.daysOfWeek.isWildcard) {
    return true;
  }
  if (!parsed.daysOfMonth.isWildcard && parsed.daysOfWeek.isWildcard) {
    return domMatch;
  }
  if (parsed.daysOfMonth.isWildcard && !parsed.daysOfWeek.isWildcard) {
    return dowMatch;
  }
  // Both specified: OR logic per POSIX cron standard
  return domMatch || dowMatch;
}

/**
 * Calculates the next occurrence date (in UTC) for a given cron expression.
 * Bounded search: checks up to 5 years from `fromDate`.
 */
export function getNextCronRunDate(expression: string, fromDate: Date = new Date()): Date {
  const parsed = parseCronExpression(expression);

  // Start from the beginning of the next minute in UTC
  const current = new Date(fromDate.getTime());
  current.setUTCSeconds(0, 0);
  current.setUTCMinutes(current.getUTCMinutes() + 1);

  // Maximum search limit: 5 years (approx 5 * 366 * 24 * 60 = 2,635,200 minutes)
  const MAX_MINUTES = 5 * 366 * 24 * 60;
  let count = 0;

  while (count < MAX_MINUTES) {
    if (matchesDate(parsed, current)) {
      return new Date(current.getTime());
    }
    current.setUTCMinutes(current.getUTCMinutes() + 1);
    count++;
  }

  throw new AppError(
    400,
    'INVALID_CRON_EXPRESSION',
    `No valid future occurrence found within 5 years for cron expression: "${expression}"`,
  );
}
