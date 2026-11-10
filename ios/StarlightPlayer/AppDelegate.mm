#import "AppDelegate.h"

#import <React/RCTBundleURLProvider.h>
#import <math.h>

static NSString *const StarlightScheduledTaskNotification = @"StarlightScheduledTaskDueNotification";
static NSString *const StarlightPendingTaskIdKey = @"starlight_pending_task_id";
static NSString *const StarlightPendingTaskSourceKey = @"starlight_pending_task_source";
static NSString *const StarlightPendingTaskScheduledAtKey = @"starlight_pending_task_scheduled_at";
static NSString *const StarlightLastAutomaticTaskIdKey = @"starlight_last_automatic_task_id";
static NSString *const StarlightLastAutomaticTaskScheduledAtKey = @"starlight_last_automatic_task_scheduled_at";
static NSTimeInterval const StarlightAutomaticNotificationDedupWindowMs = 12.0 * 60.0 * 60.0 * 1000.0;

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  UNUserNotificationCenter.currentNotificationCenter.delegate = self;
  self.moduleName = @"StarlightPlayer";
  self.initialProps = @{};

  BOOL result = [super application:application didFinishLaunchingWithOptions:launchOptions];

  // 在 RN 渲染前，用 splash 图片覆盖根视图，避免闪白屏
  UIImage *splashImage = [UIImage imageNamed:@"SplashImage"];
  if (splashImage) {
    UIImageView *splashView = [[UIImageView alloc] initWithImage:splashImage];
    splashView.frame = self.window.bounds;
    splashView.contentMode = UIViewContentModeScaleAspectFill;
    splashView.tag = 9999;
    [self.window.rootViewController.view addSubview:splashView];

    // RN 渲染完成后移除（延迟 0.5s 确保 JS 已渲染）
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.5 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
      [UIView animateWithDuration:0.2 animations:^{
        splashView.alpha = 0;
      } completion:^(BOOL finished) {
        [splashView removeFromSuperview];
      }];
    });
  }

  self.window.backgroundColor = [UIColor colorWithRed:0.071 green:0.071 blue:0.071 alpha:1.0];

  return result;
}

- (void)storeAndPublishScheduledTask:(NSString *)taskId
                              source:(NSString *)source
                         scheduledAt:(NSNumber *)scheduledAt
{
  if (taskId.length == 0) return;
  NSNumber *effectiveScheduledAt = scheduledAt ?: @([[NSDate date] timeIntervalSince1970] * 1000.0);
  NSUserDefaults *defaults = NSUserDefaults.standardUserDefaults;
  [defaults setObject:taskId forKey:StarlightPendingTaskIdKey];
  [defaults setObject:source forKey:StarlightPendingTaskSourceKey];
  [defaults setObject:effectiveScheduledAt forKey:StarlightPendingTaskScheduledAtKey];
  [[NSNotificationCenter defaultCenter] postNotificationName:StarlightScheduledTaskNotification
                                                      object:nil
                                                    userInfo:@{ @"taskId": taskId,
                                                                @"source": source,
                                                                @"scheduledAt": effectiveScheduledAt }];
}

- (void)userNotificationCenter:(UNUserNotificationCenter *)center
       willPresentNotification:(UNNotification *)notification
         withCompletionHandler:(void (^)(UNNotificationPresentationOptions options))completionHandler
{
  NSString *taskId = notification.request.content.userInfo[@"starlightTaskId"];
  if (taskId.length > 0) {
    NSNumber *scheduledAt = @(notification.date.timeIntervalSince1970 * 1000.0);
    [self storeAndPublishScheduledTask:taskId source:@"ios-foreground" scheduledAt:scheduledAt];
    completionHandler(UNNotificationPresentationOptionNone);
    return;
  }
  if (@available(iOS 14.0, *)) {
    completionHandler(UNNotificationPresentationOptionBanner | UNNotificationPresentationOptionSound);
  } else {
    completionHandler(UNNotificationPresentationOptionAlert | UNNotificationPresentationOptionSound);
  }
}

- (void)userNotificationCenter:(UNUserNotificationCenter *)center
didReceiveNotificationResponse:(UNNotificationResponse *)response
         withCompletionHandler:(void (^)(void))completionHandler
{
  NSString *taskId = response.notification.request.content.userInfo[@"starlightTaskId"];
  NSNumber *scheduledAt = @(response.notification.date.timeIntervalSince1970 * 1000.0);
  NSUserDefaults *defaults = NSUserDefaults.standardUserDefaults;
  NSString *lastAutomaticTaskId = [defaults stringForKey:StarlightLastAutomaticTaskIdKey];
  NSNumber *lastAutomaticScheduledAt = [defaults objectForKey:StarlightLastAutomaticTaskScheduledAtKey];
  if ([lastAutomaticTaskId isEqualToString:taskId] &&
      lastAutomaticScheduledAt != nil &&
      fabs(lastAutomaticScheduledAt.doubleValue - scheduledAt.doubleValue) <=
        StarlightAutomaticNotificationDedupWindowMs) {
    [center removeDeliveredNotificationsWithIdentifiers:@[response.notification.request.identifier]];
    completionHandler();
    return;
  }
  [self storeAndPublishScheduledTask:taskId source:@"notification-tap" scheduledAt:scheduledAt];
  completionHandler();
}

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
  return [self bundleURL];
}

- (NSURL *)bundleURL
{
#if DEBUG
  return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index"];
#else
  return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}

@end
