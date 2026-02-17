import { WalkSession } from './types';
import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays, format, parseISO, isSameDay } from 'date-fns';

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

/**
 * Get motivational message based on progress
 */
export function getMotivationalMessage(
  currentMinutes: number,
  targetMinutes: number,
  streak: number
): string {
  const progress = targetMinutes > 0 ? (currentMinutes / targetMinutes) * 100 : 0;

  if (progress >= 100) {
    return streak > 0 
      ? `🎉 Amazing! You've hit your goal ${streak} day${streak > 1 ? 's' : ''} in a row!`
      : "🎉 Fantastic! You've reached your daily goal!";
  } else if (progress >= 75) {
    return "You're almost there! Just a bit more to reach your goal.";
  } else if (progress >= 50) {
    return "Great progress! You're halfway to your goal.";
  } else if (progress >= 25) {
    return "Good start! Every step counts toward your goal.";
  } else if (currentMinutes > 0) {
    return "Keep going! You're building a healthy habit.";
  } else {
    return streak > 0
      ? `You're on a ${streak}-day streak! Don't break it today.`
      : "Ready to start? Your first walk is just a tap away!";
  }
}
