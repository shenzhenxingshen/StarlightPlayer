#import <Foundation/Foundation.h>

// ISO weekdays, Monday=1. Only an absent legacy field means daily.
static inline NSArray<NSNumber *> *STTaskWeekdays(NSDictionary *task)
{
  id raw = task[@"weekdays"];
  if (raw == nil) return @[@1, @2, @3, @4, @5, @6, @7];
  if (![raw isKindOfClass:NSArray.class] || [raw count] == 0) return @[];
  NSMutableSet<NSNumber *> *days = [NSMutableSet new];
  for (id day in raw) {
    if (![day isKindOfClass:NSNumber.class] || CFGetTypeID((__bridge CFTypeRef)day) == CFBooleanGetTypeID() ||
        [day doubleValue] != [day integerValue] || [day integerValue] < 1 || [day integerValue] > 7) return @[];
    [days addObject:day];
  }
  return [[days allObjects] sortedArrayUsingSelector:@selector(compare:)];
}

static inline NSDateComponents *STTaskClock(NSDictionary *task)
{
  NSDateComponents *clock = [NSDateComponents new];
  NSArray<NSString *> *keys = @[@"hour", @"minute", @"second"];
  for (NSString *key in keys) {
    id value = task[key];
    NSInteger max = [key isEqualToString:@"hour"] ? 23 : 59;
    if (![value isKindOfClass:NSNumber.class] ||
        CFGetTypeID((__bridge CFTypeRef)value) == CFBooleanGetTypeID() ||
        [value doubleValue] != [value integerValue] ||
        [value integerValue] < 0 || [value integerValue] > max) return nil;
  }
  clock.hour = [task[@"hour"] integerValue];
  clock.minute = [task[@"minute"] integerValue];
  clock.second = [task[@"second"] integerValue];
  return clock;
}

// First occurrence on this civil date; skip nonexistent DST times instead of shifting them.
static inline NSDate *STClockOnDay(NSCalendar *calendar, NSDate *day, NSDateComponents *clock)
{
  if (clock == nil) return nil;
  NSDate *start = [calendar startOfDayForDate:day];
  NSDate *candidate = [calendar nextDateAfterDate:[start dateByAddingTimeInterval:-1]
                             matchingComponents:clock
                                        options:NSCalendarMatchStrictly | NSCalendarMatchFirst];
  return candidate != nil && [calendar isDate:candidate inSameDayAsDate:day] ? candidate : nil;
}

static inline NSDate *STNextTaskDate(NSDictionary *task, NSDate *now, NSCalendar *calendar)
{
  NSArray<NSNumber *> *weekdays = STTaskWeekdays(task);
  NSDateComponents *clock = STTaskClock(task);
  if (weekdays.count == 0 || clock == nil) return nil;
  NSDate *start = [calendar startOfDayForDate:now];
  for (NSInteger offset = 0; offset < 15; offset++) {
    NSDate *day = [calendar dateByAddingUnit:NSCalendarUnitDay value:offset toDate:start options:0];
    NSInteger isoDay = ([calendar component:NSCalendarUnitWeekday fromDate:day] + 5) % 7 + 1;
    if (![weekdays containsObject:@(isoDay)]) continue;
    NSDate *candidate = STClockOnDay(calendar, day, clock);
    if (candidate != nil && [candidate compare:now] == NSOrderedDescending) return candidate;
  }
  return nil;
}

// Recover the planned time from a delivered repeating notification. Never use tap time as the
// occurrence, and never silently reinterpret an old/delayed notification as today's task.
static inline NSDate *STDeliveredTaskDate(NSDateComponents *trigger, NSDate *delivered, NSCalendar *calendar)
{
  NSDateComponents *clock = [NSDateComponents new];
  clock.hour = trigger.hour;
  clock.minute = trigger.minute;
  clock.second = trigger.second;
  if (clock.hour < 0 || clock.hour > 23 || clock.minute < 0 || clock.minute > 59 ||
      clock.second < 0 || clock.second > 59) return nil;
  NSDate *start = [calendar startOfDayForDate:delivered];
  for (NSInteger offset = 0; offset >= -1; offset--) {
    NSDate *day = [calendar dateByAddingUnit:NSCalendarUnitDay value:offset toDate:start options:0];
    if (trigger.weekday != NSDateComponentUndefined &&
        trigger.weekday != [calendar component:NSCalendarUnitWeekday fromDate:day]) continue;
    NSDate *candidate = STClockOnDay(calendar, day, clock);
    if (candidate != nil && [candidate compare:delivered] != NSOrderedDescending) return candidate;
  }
  return nil;
}
