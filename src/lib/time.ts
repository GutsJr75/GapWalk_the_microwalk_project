import { 
  parse, 
  format, 
  addMinutes, 
  differenceInMinutes,
  isWithinInterval,
  startOfDay,
  endOfDay,
  parseISO,
  isAfter,
  isBefore,
} from 'date-fns';

export const timeUtils = {
  // Parse "HH:mm" time string to Date object for today
  parseTime(timeStr: string, baseDate: Date = new Date()): Date {
    return parse(timeStr, 'HH:mm', startOfDay(baseDate));
  },
  
  // Format Date to "HH:mm"
  formatTime(date: Date): string {
    return format(date, 'HH:mm');
  },
  
  // Check if a time is within quiet hours
  isInQuietHours(
    checkTime: Date, 
    quietStart: string, 
    quietEnd: string
  ): boolean {
    const dayStart = startOfDay(checkTime);
    const qStart = this.parseTime(quietStart, dayStart);
    const qEnd = this.parseTime(quietEnd, dayStart);
    
    // Handle overnight quiet hours (e.g., 23:00 to 06:00)
    if (isAfter(qStart, qEnd)) {
      // Quiet hours span midnight
      return isAfter(checkTime, qStart) || isBefore(checkTime, qEnd);
    } else {
      // Normal case
      return isWithinInterval(checkTime, { start: qStart, end: qEnd });
    }
  },
  
  // Get active window for a day (excluding quiet hours)
  getActiveWindow(
    date: Date,
    quietStart: string,
    quietEnd: string
  ): { start: Date; end: Date } | null {
    const dayStart = startOfDay(date);
    const dayEnd = endOfDay(date);
    const qStart = this.parseTime(quietStart, dayStart);
    const qEnd = this.parseTime(quietEnd, dayStart);
    
    // Handle overnight quiet hours
    if (isAfter(qStart, qEnd)) {
      // If quiet hours span midnight, active window is qEnd to qStart
      return { start: qEnd, end: qStart };
    } else {
      // Normal case: active all day except quiet hours
      // For simplicity, we'll use the whole day and filter out quiet hours in gap detection
      return { start: dayStart, end: dayEnd };
    }
  },
  
  // Calculate minutes between two ISO strings
  minutesBetween(start: string, end: string): number {
    return differenceInMinutes(parseISO(end), parseISO(start));
  },
  
  // Add buffer minutes to ISO string
  addBuffer(isoString: string, bufferMinutes: number): string {
    return addMinutes(parseISO(isoString), bufferMinutes).toISOString();
  },
  
  // Format duration in minutes to readable string
  formatDuration(minutes: number): string {
    if (minutes < 60) {
      return `${minutes} min`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
  },
  
  // Format time range for display
  formatTimeRange(start: string, end: string): string {
    const startDate = parseISO(start);
    const endDate = parseISO(end);
    return `${format(startDate, 'h:mm')}–${format(endDate, 'h:mm a')}`;
  },
};
