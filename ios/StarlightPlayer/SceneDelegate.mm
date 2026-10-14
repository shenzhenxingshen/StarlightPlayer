#import "SceneDelegate.h"

#import "AppDelegate.h"

@interface AppDelegate (SceneForwarding)
- (void)windowScene:(UIWindowScene *)windowScene
    didUpdateCoordinateSpace:(id<UICoordinateSpace>)previousCoordinateSpace
        interfaceOrientation:(UIInterfaceOrientation)previousInterfaceOrientation
             traitCollection:(UITraitCollection *)previousTraitCollection;
@end

@implementation SceneDelegate

- (void)scene:(UIScene *)scene
    willConnectToSession:(UISceneSession *)session
                 options:(UISceneConnectionOptions *)connectionOptions
{
  if (![scene isKindOfClass:[UIWindowScene class]]) {
    return;
  }

  AppDelegate *appDelegate = (AppDelegate *)UIApplication.sharedApplication.delegate;
  self.window = appDelegate.window;
  self.window.windowScene = (UIWindowScene *)scene;
  [self.window makeKeyAndVisible];
}

- (void)windowScene:(UIWindowScene *)windowScene
    didUpdateCoordinateSpace:(id<UICoordinateSpace>)previousCoordinateSpace
        interfaceOrientation:(UIInterfaceOrientation)previousInterfaceOrientation
             traitCollection:(UITraitCollection *)previousTraitCollection
{
  AppDelegate *appDelegate = (AppDelegate *)UIApplication.sharedApplication.delegate;
  [appDelegate windowScene:windowScene
      didUpdateCoordinateSpace:previousCoordinateSpace
          interfaceOrientation:previousInterfaceOrientation
               traitCollection:previousTraitCollection];
}

// React Native 0.75 observes UIApplication lifecycle notifications. Under the
// UIScene lifecycle, bridge the equivalent scene callbacks so AppState keeps
// reporting active/inactive/background transitions.
- (void)sceneDidBecomeActive:(UIScene *)scene
{
  [[NSNotificationCenter defaultCenter]
      postNotificationName:UIApplicationDidBecomeActiveNotification
                    object:UIApplication.sharedApplication];
}

- (void)sceneWillResignActive:(UIScene *)scene
{
  [[NSNotificationCenter defaultCenter]
      postNotificationName:UIApplicationWillResignActiveNotification
                    object:UIApplication.sharedApplication];
}

- (void)sceneWillEnterForeground:(UIScene *)scene
{
  [[NSNotificationCenter defaultCenter]
      postNotificationName:UIApplicationWillEnterForegroundNotification
                    object:UIApplication.sharedApplication];
}

- (void)sceneDidEnterBackground:(UIScene *)scene
{
  [[NSNotificationCenter defaultCenter]
      postNotificationName:UIApplicationDidEnterBackgroundNotification
                    object:UIApplication.sharedApplication];
}

@end
