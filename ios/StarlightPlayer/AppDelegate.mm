#import "AppDelegate.h"

#import <React/RCTBundleURLProvider.h>

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
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
