#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
#import <UIKit/UIKit.h>
#import <UserNotifications/UserNotifications.h>

static NSString *const StarlightScheduledTaskNotification = @"StarlightScheduledTaskDueNotification";
static NSString *const StarlightPendingTaskIdKey = @"starlight_pending_task_id";
static NSString *const StarlightPendingTaskSourceKey = @"starlight_pending_task_source";
static NSString *const StarlightPendingTaskScheduledAtKey = @"starlight_pending_task_scheduled_at";
static NSString *const StarlightTaskRequestPrefix = @"starlight-task-";
static NSString *const StarlightLastAutomaticTaskIdKey = @"starlight_last_automatic_task_id";
static NSString *const StarlightLastAutomaticTaskScheduledAtKey = @"starlight_last_automatic_task_scheduled_at";

@interface ScheduledTaskManager : RCTEventEmitter <RCTBridgeModule>
@property(nonatomic, assign) BOOL hasListeners;
@property(nonatomic, strong) NSMutableDictionary<NSString *, id> *backgroundTimers;
@property(nonatomic, copy) NSArray<NSDictionary *> *scheduledTasks;
@end

@implementation ScheduledTaskManager

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup
{
  return YES;
}

- (instancetype)init
{
  self = [super init];
  if (self) {
    self.backgroundTimers = [NSMutableDictionary new];
    self.scheduledTasks = @[];
    [[NSNotificationCenter defaultCenter] addObserver:self
                                             selector:@selector(handleTaskDue:)
                                                 name:StarlightScheduledTaskNotification
                                               object:nil];
    [[NSNotificationCenter defaultCenter] addObserver:self
                                             selector:@selector(handleSignificantTimeChange:)
                                                 name:UIApplicationSignificantTimeChangeNotification
                                               object:nil];
    [[NSNotificationCenter defaultCenter] addObserver:self
                                             selector:@selector(handleSignificantTimeChange:)
                                                 name:NSSystemTimeZoneDidChangeNotification
                                               object:nil];
  }
  return self;
}

- (void)dealloc
{
  for (id timerObject in self.backgroundTimers.allValues) {
    dispatch_source_cancel((dispatch_source_t)timerObject);
  }
  [[NSNotificationCenter defaultCenter] removeObserver:self];
}

- (NSDate *)nextDateForTask:(NSDictionary *)task
{
  NSDateComponents *components = [NSDateComponents new];
  components.hour = [task[@"hour"] integerValue];
  components.minute = [task[@"minute"] integerValue];
  components.second = [task[@"second"] integerValue];
  return [[NSCalendar currentCalendar] nextDateAfterDate:[NSDate date]
                                      matchingComponents:components
                                                 options:NSCalendarMatchNextTime];
}

- (void)publishTask:(NSString *)taskId source:(NSString *)source scheduledAt:(NSNumber *)scheduledAt
{
  if (taskId.length == 0) return;
  NSUserDefaults *defaults = NSUserDefaults.standardUserDefaults;
  [defaults setObject:taskId forKey:StarlightPendingTaskIdKey];
  [defaults setObject:source forKey:StarlightPendingTaskSourceKey];
  [defaults setObject:scheduledAt forKey:StarlightPendingTaskScheduledAtKey];
  if (!self.hasListeners) return;
  [self sendEventWithName:@"ScheduledTaskDue"
                     body:@{ @"taskId": taskId,
                             @"source": source,
                             @"scheduledAt": scheduledAt }];
  [defaults removeObjectForKey:StarlightPendingTaskIdKey];
  [defaults removeObjectForKey:StarlightPendingTaskSourceKey];
  [defaults removeObjectForKey:StarlightPendingTaskScheduledAtKey];
}

- (void)scheduleBackgroundTimerForTask:(NSDictionary *)task
{
  NSString *taskId = task[@"id"];
  if (taskId.length == 0 || ![task[@"enabled"] boolValue]) return;
  NSDate *nextDate = [self nextDateForTask:task];
  if (nextDate == nil) return;

  NSTimeInterval delay = MAX(0.1, [nextDate timeIntervalSinceNow]);
  NSNumber *scheduledAt = @(nextDate.timeIntervalSince1970 * 1000.0);
  dispatch_source_t timer = dispatch_source_create(DISPATCH_SOURCE_TYPE_TIMER, 0, 0,
                                                    dispatch_get_main_queue());
  dispatch_source_set_timer(timer,
                            dispatch_time(DISPATCH_TIME_NOW, (int64_t)(delay * NSEC_PER_SEC)),
                            DISPATCH_TIME_FOREVER,
                            (uint64_t)(0.25 * NSEC_PER_SEC));
  __weak __typeof__(self) weakSelf = self;
  dispatch_source_set_event_handler(timer, ^{
    __strong __typeof__(weakSelf) strongSelf = weakSelf;
    if (strongSelf == nil) return;
    [strongSelf.backgroundTimers removeObjectForKey:taskId];
    // A dispatch timer cannot wake a suspended or terminated process. While the process is still
    // executable it is the primary trigger, including when legitimate audio playback keeps the App
    // running in the background. The local notification remains the system-supported fallback.
    NSString *source = UIApplication.sharedApplication.applicationState == UIApplicationStateActive
      ? @"ios-foreground"
      : @"ios-background";
    [strongSelf publishTask:taskId source:source scheduledAt:scheduledAt];
    [strongSelf scheduleBackgroundTimerForTask:task];
  });
  self.backgroundTimers[taskId] = timer;
  dispatch_resume(timer);
}

- (void)replaceBackgroundTimersWithTasks:(NSArray<NSDictionary *> *)tasks
{
  for (id timerObject in self.backgroundTimers.allValues) {
    dispatch_source_cancel((dispatch_source_t)timerObject);
  }
  [self.backgroundTimers removeAllObjects];
  self.scheduledTasks = [tasks copy];
  for (NSDictionary *task in self.scheduledTasks) {
    [self scheduleBackgroundTimerForTask:task];
  }
}

- (void)handleSignificantTimeChange:(__unused NSNotification *)notification
{
  [self replaceBackgroundTimersWithTasks:self.scheduledTasks];
}

- (NSArray<NSString *> *)supportedEvents
{
  return @[@"ScheduledTaskDue"];
}

- (void)startObserving
{
  self.hasListeners = YES;
}

- (void)stopObserving
{
  self.hasListeners = NO;
}

- (void)handleTaskDue:(NSNotification *)notification
{
  NSString *taskId = notification.userInfo[@"taskId"];
  NSString *source = notification.userInfo[@"source"] ?: @"notification-tap";
  NSNumber *scheduledAt = notification.userInfo[@"scheduledAt"] ?: @([[NSDate date] timeIntervalSince1970] * 1000.0);
  if (taskId.length == 0 || !self.hasListeners) {
    return;
  }
  [self sendEventWithName:@"ScheduledTaskDue"
                     body:@{ @"taskId": taskId,
                             @"source": source,
                             @"scheduledAt": scheduledAt }];
  NSUserDefaults *defaults = NSUserDefaults.standardUserDefaults;
  [defaults removeObjectForKey:StarlightPendingTaskIdKey];
  [defaults removeObjectForKey:StarlightPendingTaskSourceKey];
  [defaults removeObjectForKey:StarlightPendingTaskScheduledAtKey];
}

- (void)resolveStatus:(RCTPromiseResolveBlock)resolve
{
  [UNUserNotificationCenter.currentNotificationCenter
      getNotificationSettingsWithCompletionHandler:^(UNNotificationSettings *settings) {
        NSString *permission = @"not-determined";
        if (settings.authorizationStatus == UNAuthorizationStatusAuthorized ||
            settings.authorizationStatus == UNAuthorizationStatusProvisional) {
          permission = @"authorized";
        } else if (settings.authorizationStatus == UNAuthorizationStatusDenied) {
          permission = @"denied";
        }
        resolve(@{ @"platform": @"ios",
                   @"notificationPermission": permission,
                   @"exactAlarmPermission": @"not-needed" });
      }];
}

RCT_REMAP_METHOD(syncTasks,
                 syncTasks:(NSArray<NSDictionary *> *)tasks
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    [self replaceBackgroundTimersWithTasks:tasks];
  });
  UNUserNotificationCenter *center = UNUserNotificationCenter.currentNotificationCenter;
  [center getPendingNotificationRequestsWithCompletionHandler:^(NSArray<UNNotificationRequest *> *requests) {
    NSMutableArray<NSString *> *identifiers = [NSMutableArray new];
    for (UNNotificationRequest *request in requests) {
      if ([request.identifier hasPrefix:StarlightTaskRequestPrefix]) {
        [identifiers addObject:request.identifier];
      }
    }
    [center removePendingNotificationRequestsWithIdentifiers:identifiers];

    BOOL hasEnabledTask = NO;
    dispatch_group_t group = dispatch_group_create();
    __block NSError *scheduleError = nil;
    for (NSDictionary *task in tasks) {
      if (![task[@"enabled"] boolValue]) continue;
      NSString *taskId = task[@"id"];
      if (taskId.length == 0) continue;
      hasEnabledTask = YES;
      UNMutableNotificationContent *content = [UNMutableNotificationContent new];
      content.title = @"星光播放器定时任务";
      content.body = [NSString stringWithFormat:@"到达启动时刻；若未自动播放，请点击开始“%@”",
                                                task[@"name"] ?: @"播放任务"];
      content.sound = UNNotificationSound.defaultSound;
      content.userInfo = @{ @"starlightTaskId": taskId };
      NSDateComponents *components = [NSDateComponents new];
      components.hour = [task[@"hour"] integerValue];
      components.minute = [task[@"minute"] integerValue];
      components.second = [task[@"second"] integerValue];
      UNCalendarNotificationTrigger *trigger =
        [UNCalendarNotificationTrigger triggerWithDateMatchingComponents:components repeats:YES];
      NSString *identifier = [StarlightTaskRequestPrefix stringByAppendingString:taskId];
      UNNotificationRequest *request =
        [UNNotificationRequest requestWithIdentifier:identifier content:content trigger:trigger];
      dispatch_group_enter(group);
      [center addNotificationRequest:request withCompletionHandler:^(NSError *error) {
        if (error != nil && scheduleError == nil) scheduleError = error;
        dispatch_group_leave(group);
      }];
    }

    void (^finish)(void) = ^{
      dispatch_group_notify(group, dispatch_get_main_queue(), ^{
        if (scheduleError != nil) {
          reject(@"scheduled_task_sync_failed", scheduleError.localizedDescription, scheduleError);
        } else {
          [self resolveStatus:resolve];
        }
      });
    };
    if (hasEnabledTask) {
      [center requestAuthorizationWithOptions:(UNAuthorizationOptionAlert | UNAuthorizationOptionSound)
                           completionHandler:^(__unused BOOL granted, __unused NSError *error) {
                             finish();
                           }];
    } else {
      finish();
    }
  }];
}

RCT_REMAP_METHOD(getSchedulingStatus,
                 getSchedulingStatusWithResolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(__unused RCTPromiseRejectBlock)reject)
{
  [self resolveStatus:resolve];
}

RCT_REMAP_METHOD(requestSchedulingPermission,
                 requestSchedulingPermissionWithResolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  [UNUserNotificationCenter.currentNotificationCenter
      requestAuthorizationWithOptions:(UNAuthorizationOptionAlert | UNAuthorizationOptionSound)
                 completionHandler:^(__unused BOOL granted, NSError *error) {
                   if (error != nil) {
                     reject(@"scheduled_task_permission_failed", error.localizedDescription, error);
                   } else {
                     [self resolveStatus:resolve];
                   }
                 }];
}

RCT_REMAP_METHOD(consumePendingTrigger,
                 consumePendingTriggerWithResolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(__unused RCTPromiseRejectBlock)reject)
{
  NSUserDefaults *defaults = NSUserDefaults.standardUserDefaults;
  NSString *taskId = [defaults stringForKey:StarlightPendingTaskIdKey];
  NSString *source = [defaults stringForKey:StarlightPendingTaskSourceKey] ?: @"notification-tap";
  NSNumber *scheduledAt = [defaults objectForKey:StarlightPendingTaskScheduledAtKey];
  [defaults removeObjectForKey:StarlightPendingTaskIdKey];
  [defaults removeObjectForKey:StarlightPendingTaskSourceKey];
  [defaults removeObjectForKey:StarlightPendingTaskScheduledAtKey];
  if (taskId.length == 0) {
    resolve((id)kCFNull);
    return;
  }
  resolve(@{ @"taskId": taskId,
             @"source": source,
             @"scheduledAt": scheduledAt ?: @([[NSDate date] timeIntervalSince1970] * 1000.0) });
}

RCT_EXPORT_METHOD(markAutomaticTaskStarted:(NSString *)taskId
                  scheduledAt:(nonnull NSNumber *)scheduledAt)
{
  if (taskId.length == 0 || scheduledAt == nil) return;
  NSUserDefaults *defaults = NSUserDefaults.standardUserDefaults;
  [defaults setObject:taskId forKey:StarlightLastAutomaticTaskIdKey];
  [defaults setObject:scheduledAt forKey:StarlightLastAutomaticTaskScheduledAtKey];
  NSString *identifier = [StarlightTaskRequestPrefix stringByAppendingString:taskId];
  [UNUserNotificationCenter.currentNotificationCenter
      removeDeliveredNotificationsWithIdentifiers:@[identifier]];
}

@end

