#import "../../ios/StarlightPlayer/ScheduledTaskCalendar.h"

static NSInteger assertions = 0;
static void check(BOOL ok, NSString *label) {
  assertions++;
  if (!ok) { NSLog(@"FAILED: %@", label); exit(1); }
}
static NSDate *at(NSString *iso) {
  return [[NSISO8601DateFormatter new] dateFromString:iso];
}
static NSCalendar *calendar(NSString *zone) {
  NSCalendar *calendar = [[NSCalendar alloc] initWithCalendarIdentifier:NSCalendarIdentifierGregorian];
  calendar.timeZone = [NSTimeZone timeZoneWithName:zone];
  return calendar;
}
static NSDictionary *task(NSInteger h, NSInteger m, NSInteger s, NSArray *days) {
  return @{@"hour": @(h), @"minute": @(m), @"second": @(s), @"weekdays": days};
}
static void next(NSString *zone, NSString *now, NSDictionary *task, NSString *expected) {
  NSDate *actual = STNextTaskDate(task, at(now), calendar(zone));
  check([actual isEqualToDate:at(expected)], [NSString stringWithFormat:@"%@ expected %@ got %@", zone, expected, actual]);
}
int main(void) {
  @autoreleasepool {
    NSArray *all = @[@1,@2,@3,@4,@5,@6,@7];
    next(@"Asia/Shanghai", @"2026-11-15T15:59:58Z", task(23,59,59,@[@7]), @"2026-11-15T15:59:59Z");
    next(@"Asia/Shanghai", @"2026-11-15T15:59:59Z", task(23,59,59,@[@7]), @"2026-11-22T15:59:59Z");
    next(@"Asia/Shanghai", @"2026-11-15T15:59:59Z", task(0,0,0,@[@1]), @"2026-11-15T16:00:00Z");
    next(@"Asia/Shanghai", @"2026-12-31T16:00:00Z", task(0,0,0,all), @"2027-01-01T16:00:00Z");
    next(@"America/New_York", @"2026-03-08T05:00:00Z", task(2,30,0,all), @"2026-03-09T06:30:00Z");
    next(@"America/New_York", @"2026-03-08T05:00:00Z", task(2,30,0,@[@7]), @"2026-03-15T06:30:00Z");
    next(@"America/New_York", @"2026-11-01T04:00:00Z", task(1,30,0,all), @"2026-11-01T05:30:00Z");
    next(@"America/New_York", @"2026-11-01T05:45:00Z", task(1,30,0,@[@7]), @"2026-11-08T06:30:00Z");
    next(@"Australia/Lord_Howe", @"2026-10-03T14:00:00Z", task(2,15,0,all), @"2026-10-04T15:15:00Z");
    next(@"Asia/Kathmandu", @"2026-11-15T18:14:59Z", task(0,0,0,@[@1]), @"2026-11-15T18:15:00Z");
    check([STTaskWeekdays(@{}) isEqual:all], @"legacy daily");
    for (id invalid in @[[NSNull null], @[], @[@0], @[@8], @[@1.5], @[@YES], @[@"1"]]) {
      check(STTaskWeekdays(@{@"weekdays":invalid}).count == 0, @"invalid weekdays");
    }
    check([STTaskWeekdays(@{@"weekdays":@[@7,@1,@1]}) isEqual:@[@1,@7]], @"sort unique");
    check(STNextTaskDate(task(24,0,0,all), at(@"2026-11-16T00:00:00Z"), calendar(@"UTC")) == nil, @"invalid clock");
    NSDateComponents *trigger = STTaskClock(task(23,59,59,all));
    trigger.weekday = 1; // Foundation Sunday.
    check([STDeliveredTaskDate(trigger, at(@"2026-11-15T16:00:10Z"), calendar(@"Asia/Shanghai"))
           isEqualToDate:at(@"2026-11-15T15:59:59Z")], @"Sunday delivery after midnight");
    check(STDeliveredTaskDate(trigger, at(@"2026-11-17T16:00:10Z"), calendar(@"Asia/Shanghai")) == nil, @"no fabricated occurrence");
    NSLog(@"ScheduledTaskCalendar Foundation: %ld assertions passed", (long)assertions);
  }
  return 0;
}
