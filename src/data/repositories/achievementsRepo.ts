import { getDatabase } from '../db';
import { sessionsRepo } from './sessionsRepo';
import { calculateStreak } from '../../utils/statsUtils';
import { startOfDay, format } from 'date-fns';

// ────────────────────────────────────────────────────────
// Achievement definitions
// ────────────────────────────────────────────────────────

export type AchievementId =
  | 'first_walk'
  | 'streak_3'
  | 'streak_7'
  | 'streak_14'
  | 'streak_30'
  | 'total_walks_10'
  | 'total_walks_50'
  | 'total_walks_100'
  | 'total_min_60'
  | 'total_min_300'
  | 'total_min_1000'
  | 'steps_10k_day'
  | 'steps_50k_week'
  | 'distance_5k'
  | 'early_bird'
  | 'night_owl'
  | 'perfect_week';

export interface AchievementDef {
  id: AchievementId;
  title: string;
  description: string;
  icon: string;          // Ionicons icon name
  color: string;         // badge accent colour
  category: 'streak' | 'walks' | 'effort' | 'lifestyle';
}

export interface UnlockedAchievement {
  id: AchievementId;
  unlockedAt: string; // ISO
}

export const ACHIEVEMENTS: AchievementDef[] = [
  // Streak
  { id: 'first_walk',   title: 'First Steps',     description: 'Complete your very first walk',          icon: 'footsteps-outline',  color: '#2ee9a6', category: 'streak' },
  { id: 'streak_3',     title: 'Getting Going',    description: 'Walk 3 days in a row',                  icon: 'flame-outline',      color: '#f97316', category: 'streak' },
  { id: 'streak_7',     title: 'Week Warrior',     description: 'Walk 7 days in a row',                  icon: 'flame',              color: '#f97316', category: 'streak' },
  { id: 'streak_14',    title: 'Two-Week Titan',   description: 'Walk 14 days in a row',                 icon: 'trophy-outline',     color: '#eab308', category: 'streak' },
  { id: 'streak_30',    title: 'Monthly Legend',   description: 'Walk 30 days in a row',                 icon: 'trophy',             color: '#eab308', category: 'streak' },
  // Walks
  { id: 'total_walks_10',  title: 'Double Digits',   description: 'Complete 10 walks total',             icon: 'walk-outline',       color: '#38bdf8', category: 'walks' },
  { id: 'total_walks_50',  title: 'Regular Walker',  description: 'Complete 50 walks total',             icon: 'walk',               color: '#38bdf8', category: 'walks' },
  { id: 'total_walks_100', title: 'Walk Centurion',  description: 'Complete 100 walks total',            icon: 'medal-outline',      color: '#a78bfa', category: 'walks' },
  // Effort
  { id: 'total_min_60',    title: 'First Hour',      description: 'Walk a total of 60 minutes',          icon: 'time-outline',       color: '#2ee9a6', category: 'effort' },
  { id: 'total_min_300',   title: 'Five Hours',      description: 'Walk a total of 300 minutes',         icon: 'timer-outline',      color: '#4ade80', category: 'effort' },
  { id: 'total_min_1000',  title: 'Marathon Mind',   description: 'Walk a total of 1 000 minutes',       icon: 'ribbon-outline',     color: '#eab308', category: 'effort' },
  { id: 'steps_10k_day',   title: '10K Day',         description: 'Walk 10 000 steps in a single day',   icon: 'speedometer-outline',color: '#f97316', category: 'effort' },
  { id: 'steps_50k_week',  title: 'Week Pacer',      description: 'Walk 50 000 steps in a single week',  icon: 'speedometer',        color: '#ef4444', category: 'effort' },
  { id: 'distance_5k',     title: '5K Club',         description: 'Walk 5 km in a single session',       icon: 'map-outline',        color: '#38bdf8', category: 'effort' },
  // Lifestyle
  { id: 'early_bird',      title: 'Early Bird',      description: 'Start a walk before 7 AM',            icon: 'sunny-outline',      color: '#fbbf24', category: 'lifestyle' },
  { id: 'night_owl',       title: 'Night Owl',       description: 'Start a walk after 9 PM',             icon: 'moon-outline',       color: '#818cf8', category: 'lifestyle' },
  { id: 'perfect_week',    title: 'Perfect Week',    description: 'Hit your daily goal every day for 7 days', icon: 'star',           color: '#eab308', category: 'lifestyle' },
];

const ACHIEVEMENT_MAP = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

export const getAchievementDef = (id: AchievementId): AchievementDef | undefined =>
  ACHIEVEMENT_MAP.get(id);

// ────────────────────────────────────────────────────────
// Persistence
// ────────────────────────────────────────────────────────

export const achievementsRepo = {
  /** Ensure the table exists (called from db.ts migration) */
  async ensureTable(): Promise<void> {
    const db = await getDatabase();
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS achievements (
        id TEXT PRIMARY KEY,
        unlocked_at TEXT NOT NULL
      );
    `);
  },

  async getAll(): Promise<UnlockedAchievement[]> {
    await this.ensureTable();
    const db = await getDatabase();
    const rows = await db.getAllAsync<{ id: string; unlocked_at: string }>(
      'SELECT id, unlocked_at FROM achievements ORDER BY unlocked_at DESC'
    );
    return rows.map((r) => ({ id: r.id as AchievementId, unlockedAt: r.unlocked_at }));
  },

  async unlock(id: AchievementId): Promise<boolean> {
    await this.ensureTable();
    const db = await getDatabase();
    const existing = await db.getFirstAsync<{ id: string }>(
      'SELECT id FROM achievements WHERE id = ?',
      [id]
    );
    if (existing) return false; // already unlocked
    await db.runAsync(
      'INSERT INTO achievements (id, unlocked_at) VALUES (?, ?)',
      [id, new Date().toISOString()]
    );
    return true;
  },

  async isUnlocked(id: AchievementId): Promise<boolean> {
    await this.ensureTable();
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ id: string }>(
      'SELECT id FROM achievements WHERE id = ?',
      [id]
    );
    return !!row;
  },

  /**
   * Evaluate all achievements and unlock any that are newly earned.
   * Returns the list of *newly* unlocked achievement IDs.
   */
  async evaluate(dailyTargetMinutes?: number): Promise<AchievementId[]> {
    await this.ensureTable();
    const sessions = await sessionsRepo.getAll();
    if (sessions.length === 0) return [];

    const newlyUnlocked: AchievementId[] = [];
    const tryUnlock = async (id: AchievementId, condition: boolean) => {
      if (condition) {
        const unlocked = await this.unlock(id);
        if (unlocked) newlyUnlocked.push(id);
      }
    };

    // Aggregates
    const totalSessions = sessions.length;
    const totalMinutes = sessions.reduce((sum, s) => sum + Math.floor(s.activeSeconds / 60), 0);
    const streak = calculateStreak(sessions);

    // Per-day aggregates
    const daySteps = new Map<string, number>();
    const dayMinutes = new Map<string, number>();
    sessions.forEach((s) => {
      const key = format(new Date(s.start), 'yyyy-MM-dd');
      daySteps.set(key, (daySteps.get(key) ?? 0) + (s.steps ?? 0));
      dayMinutes.set(key, (dayMinutes.get(key) ?? 0) + Math.floor(s.activeSeconds / 60));
    });

    // Per-week step aggregates (ISO week key)
    const weekSteps = new Map<string, number>();
    sessions.forEach((s) => {
      const d = new Date(s.start);
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay());
      const key = format(weekStart, 'yyyy-MM-dd');
      weekSteps.set(key, (weekSteps.get(key) ?? 0) + (s.steps ?? 0));
    });

    // Streak badges
    await tryUnlock('first_walk', totalSessions >= 1);
    await tryUnlock('streak_3', streak.currentStreak >= 3 || streak.longestStreak >= 3);
    await tryUnlock('streak_7', streak.currentStreak >= 7 || streak.longestStreak >= 7);
    await tryUnlock('streak_14', streak.currentStreak >= 14 || streak.longestStreak >= 14);
    await tryUnlock('streak_30', streak.currentStreak >= 30 || streak.longestStreak >= 30);

    // Walk count
    await tryUnlock('total_walks_10', totalSessions >= 10);
    await tryUnlock('total_walks_50', totalSessions >= 50);
    await tryUnlock('total_walks_100', totalSessions >= 100);

    // Total minutes
    await tryUnlock('total_min_60', totalMinutes >= 60);
    await tryUnlock('total_min_300', totalMinutes >= 300);
    await tryUnlock('total_min_1000', totalMinutes >= 1000);

    // 10K steps in a single day
    const max10k = Math.max(0, ...Array.from(daySteps.values()));
    await tryUnlock('steps_10k_day', max10k >= 10000);

    // 50K steps in a single week
    const maxWeekSteps = Math.max(0, ...Array.from(weekSteps.values()));
    await tryUnlock('steps_50k_week', maxWeekSteps >= 50000);

    // 5K walk
    const max5k = sessions.reduce((mx, s) => Math.max(mx, s.distanceMeters ?? 0), 0);
    await tryUnlock('distance_5k', max5k >= 5000);

    // Early bird & Night owl
    const hasEarlyBird = sessions.some((s) => new Date(s.start).getHours() < 7);
    await tryUnlock('early_bird', hasEarlyBird);
    const hasNightOwl = sessions.some((s) => new Date(s.start).getHours() >= 21);
    await tryUnlock('night_owl', hasNightOwl);

    // Perfect week — 7 consecutive days all meeting daily target
    if (dailyTargetMinutes && dailyTargetMinutes > 0) {
      const sortedDays = Array.from(dayMinutes.entries())
        .sort((a, b) => a[0].localeCompare(b[0]));
      let consecutiveGoalDays = 0;
      let maxConsecutive = 0;
      for (let i = 0; i < sortedDays.length; i++) {
        const [dayKey, mins] = sortedDays[i];
        if (mins >= dailyTargetMinutes) {
          consecutiveGoalDays++;
          if (i > 0) {
            const prev = new Date(sortedDays[i - 1][0]);
            const curr = new Date(dayKey);
            const diffMs = curr.getTime() - prev.getTime();
            if (diffMs > 86400000 * 1.5) {
              consecutiveGoalDays = 1;
            }
          }
        } else {
          consecutiveGoalDays = 0;
        }
        maxConsecutive = Math.max(maxConsecutive, consecutiveGoalDays);
      }
      await tryUnlock('perfect_week', maxConsecutive >= 7);
    }

    return newlyUnlocked;
  },
};
