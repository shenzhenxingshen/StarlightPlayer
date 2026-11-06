#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
#import <UserNotifications/UserNotifications.h>

static NSString *const StarlightScheduledTaskNotification = @"StarlightScheduledTaskDueNotification";
static NSString *const StarlightPendingTaskIdKey = @"starlight_pending_task_id";
static NSString *const StarlightPendingTaskSourceKey = @"starlight_pending_task_source";
static NSString *const StarlightPendingTaskScheduledAtKey = @"starlight_pending_task_scheduled_at";
static NSString *const StarlightTaskRequestPrefix = @"starlight-task-";

@interface ScheduledTaskManager : RCTEventEmitter <RCTBridgeModule>
@property(nonatomic, assign) BOOL hasListeners;
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
    [[NSNotificationCenter defaultCenter] addObserver:self
                                             selector:@selector(handleTaskDue:)
                                                 name:StarlightScheduledTaskNotification
                                               object:nil];
  }
  return self;
}

- (void)dealloc
{
  [[NSNotificationCenter defaultCenter] removeObserver:self];
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
      content.body = [NSString stringWithFormat:@"点击开始“%@”", task[@"name"] ?: @"播放任务"];
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

@end

