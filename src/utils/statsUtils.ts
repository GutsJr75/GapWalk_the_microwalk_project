import { StrictnessMode, WalkSession } from '../types';
import { startOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays, format, parseISO, isSameDay, isValid } from 'date-fns';

export interface StreakData {
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string | null;
}

export interface WeeklyStats {
  weekStart: string;
  weekEnd: string;
  totalMinutes: number;
  totalSteps: number;
  totalSessions: number;
  totalDistance: number;
  totalCalories: number;
  daysActive: number;
}

export interface WeeklyHistoryEntry {
  weekStart: string;
  weekEnd: string;
  totalMinutes: number;
  totalSteps: number;
  totalSessions: number;
  daysActive: number;
}

/** Per-day breakdown within a week (Sun=0 … Sat=6). */
export interface DailyBreakdown {
  /** 0-based day of week (0=Sun, 6=Sat) */
  dayOfWeek: number;
  /** 'yyyy-MM-dd' */
  date: string;
  minutes: number;
  steps: number;
  sessions: number;
}

/**
 * Given all sessions, return an array of 7 DailyBreakdown entries
 * for the week that starts on `weekStartISO` (a Sunday).
 */
export function calculateDailyBreakdown(
  sessions: WalkSession[],
  weekStartISO: string,
): DailyBreakdown[] {
  const weekStart = parseISO(weekStartISO);
  const days: DailyBreakdown[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return {
      dayOfWeek: i,
      date: format(d, 'yyyy-MM-dd'),
      minutes: 0,
      steps: 0,
      sessions: 0,
    };
  });

  sessions.forEach((s) => {
    const sessionDate = parseISO(s.start);
    if (!isValid(sessionDate)) return;
    const dayKey = format(sessionDate, 'yyyy-MM-dd');
    const match = days.find((d) => d.date === dayKey);
    if (match) {
      match.minutes += Math.floor(s.activeSeconds / 60);
      match.steps += s.steps ?? 0;
      match.sessions += 1;
    }
  });

  return days;
}

export interface MonthlyStats {
  month: string;
  totalMinutes: number;
  totalSessions: number;
  totalDistance: number;
  totalCalories: number;
  daysActive: number;
  averageMinutesPerDay: number;
}

/**
 * Calculate streak from walk sessions
 */
export function calculateStreak(sessions: WalkSession[]): StreakData {
  if (sessions.length === 0) {
    return { currentStreak: 0, longestStreak: 0, lastActiveDate: null };
  }

  // Get unique dates with walks
  const datesWithWalks = new Set<string>();
  sessions.forEach(s => {
    const date = format(parseISO(s.start), 'yyyy-MM-dd');
    datesWithWalks.add(date);
  });

  const sortedDates = Array.from(datesWithWalks)
    .map(d => parseISO(d))
    .sort((a, b) => b.getTime() - a.getTime());

  let currentStreak = 0;
  let longestStreak = 0;
  let tempStreak = 0;
  const today = startOfDay(new Date());
  let expectedDate = today;

  for (const date of sortedDates) {
    const dateStart = startOfDay(date);
    
    // Check if this date matches expected date for streak
    if (isSameDay(dateStart, expectedDate)) {
      currentStreak++;
      tempStreak++;
      expectedDate = subDays(expectedDate, 1);
    } else if (isSameDay(dateStart, subDays(today, 1))) {
      // If yesterday, start counting
      currentStreak = 1;
      tempStreak = 1;
      expectedDate = subDays(dateStart, 1);
    } else {
      // Streak broken
      if (tempStreak > longestStreak) longestStreak = tempStreak;
      tempStreak = 0;
    }
  }

  if (tempStreak > longestStreak) longestStreak = tempStreak;
  if (!isSameDay(sortedDates[0], today) && !isSameDay(sortedDates[0], subDays(today, 1))) {
    currentStreak = 0;
  }

  return {
    currentStreak,
    longestStreak,
    lastActiveDate: sortedDates.length > 0 ? format(sortedDates[0], 'yyyy-MM-dd') : null,
  };
}

/**
 * Calculate weekly stats
 */
export function calculateWeeklyStats(sessions: WalkSession[], weekStartDate: Date = new Date()): WeeklyStats {
  const weekStart = startOfWeek(weekStartDate, { weekStartsOn: 0 });
  const weekEnd = endOfWeek(weekStartDate, { weekStartsOn: 0 });
  
  const weekSessions = sessions.filter(s => {
    const sessionDate = parseISO(s.start);
    return sessionDate >= weekStart && sessionDate <= weekEnd;
  });

  const daysWithWalks = new Set<string>();
  let totalMinutes = 0;
  let totalSteps = 0;
  let totalDistance = 0;
  let totalCalories = 0;

  weekSessions.forEach(s => {
    const date = format(parseISO(s.start), 'yyyy-MM-dd');
    daysWithWalks.add(date);
    totalMinutes += Math.floor(s.activeSeconds / 60);
    totalSteps += s.steps ?? 0;
    if (s.distanceMeters) totalDistance += s.distanceMeters;
    if (s.calories) totalCalories += s.calories;
  });

  return {
    weekStart: format(weekStart, 'yyyy-MM-dd'),
    weekEnd: format(weekEnd, 'yyyy-MM-dd'),
    totalMinutes,
    totalSteps,
    totalSessions: weekSessions.length,
    totalDistance,
    totalCalories,
    daysActive: daysWithWalks.size,
  };
}

/**
 * Calculate historical weekly rollups, newest week first.
 * Data is derived from persisted walk sessions, so prior weeks are retained automatically.
 */
export function calculateWeeklyHistory(
  sessions: WalkSession[],
  maxWeeks = 52
): WeeklyHistoryEntry[] {
  if (sessions.length === 0) return [];

  const grouped = new Map<
    string,
    { totalMinutes: number; totalSteps: number; totalSessions: number; days: Set<string> }
  >();

  sessions.forEach((s) => {
    const sessionDate = parseISO(s.start);
    if (!isValid(sessionDate)) return;
    const weekStartDate = startOfWeek(sessionDate, { weekStartsOn: 0 });
    const weekKey = format(weekStartDate, 'yyyy-MM-dd');
    const dayKey = format(sessionDate, 'yyyy-MM-dd');

    const existing = grouped.get(weekKey);
    if (existing) {
      existing.totalMinutes += Math.floor(s.activeSeconds / 60);
      existing.totalSteps += s.steps ?? 0;
      existing.totalSessions += 1;
      existing.days.add(dayKey);
      return;
    }

    grouped.set(weekKey, {
      totalMinutes: Math.floor(s.activeSeconds / 60),
      totalSteps: s.steps ?? 0,
      totalSessions: 1,
      days: new Set([dayKey]),
    });
  });

  return Array.from(grouped.entries())
    .map(([weekStart, bucket]) => {
      const weekStartDate = parseISO(weekStart);
      const weekEndDate = endOfWeek(weekStartDate, { weekStartsOn: 0 });
      return {
        weekStart,
        weekEnd: format(weekEndDate, 'yyyy-MM-dd'),
        totalMinutes: bucket.totalMinutes,
        totalSteps: bucket.totalSteps,
        totalSessions: bucket.totalSessions,
        daysActive: bucket.days.size,
      };
    })
    .sort((a, b) => b.weekStart.localeCompare(a.weekStart))
    .slice(0, maxWeeks);
}

/**
 * Calculate monthly stats
 */
export function calculateMonthlyStats(sessions: WalkSession[], monthDate: Date = new Date()): MonthlyStats {
  const monthStart = startOfMonth(monthDate);
  const monthEnd = endOfMonth(monthDate);
  
  const monthSessions = sessions.filter(s => {
    const sessionDate = parseISO(s.start);
    return sessionDate >= monthStart && sessionDate <= monthEnd;
  });

  const daysWithWalks = new Set<string>();
  let totalMinutes = 0;
  let totalDistance = 0;
  let totalCalories = 0;

  monthSessions.forEach(s => {
    const date = format(parseISO(s.start), 'yyyy-MM-dd');
    daysWithWalks.add(date);
    totalMinutes += Math.floor(s.activeSeconds / 60);
    if (s.distanceMeters) totalDistance += s.distanceMeters;
    if (s.calories) totalCalories += s.calories;
  });

  const daysInMonth = monthEnd.getDate();
  const averageMinutesPerDay = daysInMonth > 0 ? Math.round(totalMinutes / daysInMonth) : 0;

  return {
    month: format(monthDate, 'MMMM yyyy'),
    totalMinutes,
    totalSessions: monthSessions.length,
    totalDistance,
    totalCalories,
    daysActive: daysWithWalks.size,
    averageMinutesPerDay,
  };
}

interface MotivationalMessageInput {
  currentMinutes: number;
  targetMinutes: number;
  streak: number;
  strictnessMode?: StrictnessMode;
  now?: Date;
}

const pickStableMessage = (messages: string[], seed: string): string => {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return messages[hash % messages.length];
};

const getTimeBand = (now: Date): 'morning' | 'afternoon' | 'evening' => {
  const hour = now.getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
};

/**
 * Get a dashboard-ready motivational message.
 * The selected line is deterministic for the current day and progress bucket
 * so it feels varied without flickering on every render.
 */
export function getMotivationalMessage({
  currentMinutes,
  targetMinutes,
  streak,
  strictnessMode = 'easygoing',
  now = new Date(),
}: MotivationalMessageInput): string {
  const progress = targetMinutes > 0 ? (currentMinutes / targetMinutes) * 100 : 0;
  const timeBand = getTimeBand(now);
  const daySeed = format(now, 'yyyy-MM-dd');

  let bucket = 'start';
  let messages: string[] = [];

  if (progress >= 100) {
    bucket = streak > 0 ? 'goal-hit-streak' : 'goal-hit';
    messages = streak > 0
      ? [
          `Goal hit. ${streak}-day streak protected.`,
          'Daily target handled. Your streak remains annoyingly strong.',
          'You showed up, finished the job, and kept the streak breathing.',
          'Another day, another streak rescue mission completed.',
        ]
      : [
          'Daily goal done. Quietly elite behavior.',
          'Target cleared. Your future self filed a thank-you note.',
          'You did the walk. The walk did its part.',
          'Goal reached. Very respectable main-character behavior.',
        ];
  } else if (progress >= 75) {
    bucket = 'almost-there';
    messages = [
      'One more push and today counts.',
      "You're in the red zone now. Finish the drive.",
      'So close. Your shoes would like to see this through.',
      'A few more minutes and this becomes a win.',
    ];
  } else if (progress >= 50) {
    bucket = 'halfway';
    messages = [
      'Halfway there. Your legs are officially involved.',
      'Good pace. This is where momentum starts feeling real.',
      'Half done. Future you is already less grumpy.',
      "You're in the middle of the movie now. Keep walking.",
    ];
  } else if (progress >= 25) {
    bucket = 'quarter-done';
    messages = [
      'Good start. Tiny walks still cash real checks.',
      'You got the ball rolling. Keep it moving.',
      'Quarter done. Momentum always starts looking awkward.',
      'Small start, real progress. That is how this works.',
    ];
  } else if (currentMinutes > 0) {
    bucket = 'started';
    messages = [
      'Keep going. Habits are built in embarrassingly small reps.',
      'The walk has begun. That already counts for something.',
      'Tiny start. Legit win. Keep stacking it.',
      'You broke the seal. Now give it a few more minutes.',
    ];
  } else if (streak > 0) {
    bucket = strictnessMode === 'no_excuses' ? 'streak-strict' : 'streak';
    messages = strictnessMode === 'no_excuses'
      ? [
          `No-excuses mode. Your ${streak}-day streak expects attendance.`,
          `Strict mode is on. ${streak} straight days says you know the drill.`,
          `Your ${streak}-day streak did not survive this long for a soft launch.`,
          'Discipline check. One walk first, then the excuses can file an appeal.',
        ]
      : [
          `Your ${streak}-day streak called. It wants protection.`,
          'Streak on the line. No pressure, just history.',
          `You did not build a ${streak}-day streak to ghost it now.`,
          'Your streak made it this far. Do not leave it unsupervised.',
        ];
  } else if (strictnessMode === 'no_excuses') {
    bucket = `strict-${timeBand}`;
    messages = timeBand === 'morning'
      ? [
          'No-excuses mode means the day already owes you a walk.',
          'Strict mode is on. Shoes first, excuses later.',
          'No-excuses mode is not subtle. Time to move.',
          'Discipline first. Negotiation can happen after the walk.',
        ]
      : timeBand === 'afternoon'
        ? [
            'Midday in no-excuses mode still counts as on time.',
            'Strict mode does not care that the day got busy.',
            'No-excuses mode politely declines your calendar drama.',
            'You still have time to make the disciplined choice.',
          ]
        : [
            'Evening is not an alibi in no-excuses mode.',
            'Strict mode says the day is not done yet.',
            'The clock is moving, but the window is still open.',
            'This is the part where discipline gets its screen time.',
          ];
  } else {
    bucket = `start-${timeBand}`;
    messages = timeBand === 'morning'
      ? [
          'Morning is clean. Start the day with a small win.',
          'First walk, then the rest of the day gets easier.',
          'A short walk this morning does loud things for your mood.',
          'Start small now, brag silently later.',
        ]
      : timeBand === 'afternoon'
        ? [
            'Midday reset. A short walk can still steal this day back.',
            'This day is still very saveable.',
            'Not too late. A MicroWalk still counts big.',
            'Lunch-break energy, but make it useful.',
          ]
        : [
            'The day is not over yet. Sneak in the win.',
            'Evening walk. Quiet redemption arc.',
            'Still time to put points on the board.',
            'A late small walk still beats a perfect plan that never happened.',
          ];
  }

  return pickStableMessage(
    messages,
    `${daySeed}|${bucket}|${timeBand}|${streak}|${strictnessMode}`
  );
}
