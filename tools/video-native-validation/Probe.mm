#import "../../ios/StarlightPlayer/VideoProgramPlayer.mm"

@implementation RCTViewManager
@end

@interface Probe : UIResponder <UIApplicationDelegate>
@property(nonatomic, strong) UIWindow *window;
@property(nonatomic, strong) VideoProgramPlayer *module;
@property(nonatomic, strong) NSMutableArray *events;
@property(nonatomic, strong) NSDictionary *manifest;
@property(nonatomic, strong) NSArray *scenarios;
@property(nonatomic) NSUInteger next;
@end

@implementation Probe
- (void)record:(NSDictionary *)event {
  NSMutableDictionary *record = [event mutableCopy];
  record[@"wallMs"] = @(NSDate.date.timeIntervalSince1970 * 1000);
  [self.events addObject:record];
}
- (NSDictionary *)config:(NSArray *)ids repeats:(NSArray *)counts elapsed:(double)elapsed {
  NSMutableArray *spans = [NSMutableArray new];
  NSArray *assets = self.manifest[@"assets"];
  for (NSUInteger i = 0; i < ids.count; i++) {
    NSDictionary *asset = nil;
    for (NSDictionary *a in assets) if ([a[@"id"] isEqual:ids[i]]) asset = a;
    NSAssert(asset, @"Missing asset");
    for (int n = 0; n < [counts[i] intValue]; n++)
      [spans addObject:@{@"file":asset[@"file"], @"durationTicks":asset[@"durationTicks"]}];
  }
  return @{@"timescale":@44100, @"startEpochMs":@((NSDate.date.timeIntervalSince1970 - elapsed) * 1000), @"spans":spans};
}
- (void)finish {
  [self.module stop:^(id result) {} rejecter:^(NSString *c, NSString *m, NSError *e) {}];
  NSURL *docs = [NSFileManager.defaultManager URLsForDirectory:NSDocumentDirectory inDomains:NSUserDomainMask].firstObject;
  NSData *data = [NSJSONSerialization dataWithJSONObject:self.events options:NSJSONWritingPrettyPrinted error:nil];
  [data writeToURL:[docs URLByAppendingPathComponent:@"events.json"] atomically:YES];
  [@"done" writeToURL:[docs URLByAppendingPathComponent:@"complete.txt"] atomically:YES encoding:NSUTF8StringEncoding error:nil];
}
- (void)sample:(NSString *)name until:(double)deadline completion:(dispatch_block_t)done {
  SLVideoEngine *engine = SLVideoEngine.shared;
  double actual = CMTimeGetSeconds(engine.player.currentTime);
  double expected = NSDate.date.timeIntervalSince1970 - engine.origin;
  [self record:@{@"event":@"sample", @"scenario":name, @"expected":@(expected),
    @"actual":@(isfinite(actual) ? actual : -1), @"rate":@(engine.player.rate),
    @"error":engine.error ?: @""}];
  if (NSDate.date.timeIntervalSince1970 >= deadline) { done(); return; }
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 100 * NSEC_PER_MSEC), dispatch_get_main_queue(), ^{
    [self sample:name until:deadline completion:done];
  });
}
- (void)runNext {
  if (self.next >= self.scenarios.count) { [self finish]; return; }
  NSDictionary *scenario = self.scenarios[self.next++];
  NSString *name = scenario[@"name"];
  NSDictionary *config = [self config:scenario[@"ids"] repeats:scenario[@"repeats"] elapsed:[scenario[@"elapsed"] doubleValue]];
  double started = NSDate.date.timeIntervalSince1970;
  [self record:@{@"event":@"load", @"scenario":name, @"config":config}];
  [self.module load:config resolver:^(id result) {
    [self record:@{@"event":@"ready", @"scenario":name, @"loadSeconds":@(NSDate.date.timeIntervalSince1970 - started)}];
    [self sample:name until:NSDate.date.timeIntervalSince1970 + [scenario[@"seconds"] doubleValue] completion:^{
      if ([name isEqual:@"pause-resume"]) {
        [self.module pause:^(id r) {
          [self record:@{@"event":@"paused", @"scenario":name}];
          [self sample:@"paused-hold" until:NSDate.date.timeIntervalSince1970 + 1 completion:^{
            [self.module load:config resolver:^(id value) {
              [self record:@{@"event":@"resumed", @"scenario":name}];
              [self sample:@"resumed" until:NSDate.date.timeIntervalSince1970 + 2 completion:^{ [self runNext]; }];
            } rejecter:^(NSString *c, NSString *m, NSError *e) {
              [self record:@{@"event":@"failure", @"scenario":name, @"code":c, @"message":m}]; [self runNext];
            }];
          }];
        } rejecter:^(NSString *c, NSString *m, NSError *e) { [self runNext]; }];
      } else [self runNext];
    }];
  } rejecter:^(NSString *code, NSString *message, NSError *error) {
    [self record:@{@"event":@"rejected", @"scenario":name, @"code":code, @"message":message}];
    [self runNext];
  }];
}
- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)options {
  self.events = [NSMutableArray new];
  self.module = [VideoProgramPlayer new];
  NSURL *url = [NSBundle.mainBundle URLForResource:@"manifest" withExtension:@"json" subdirectory:@"video"];
  self.manifest = [NSJSONSerialization JSONObjectWithData:[NSData dataWithContentsOfURL:url] options:0 error:nil];
  self.window = [[UIWindow alloc] initWithFrame:UIScreen.mainScreen.bounds];
  UIViewController *vc = [UIViewController new];
  vc.view = [SLVideoView new];
  self.window.rootViewController = vc;
  [self.window makeKeyAndVisible];
  NSArray *ids = @[@"intro49", @"salutation", @"regular", @"final", @"outro"];
  NSArray *counts = @[@1, @1, @48, @1, @1];
  double salutationEnd = 5 + 1641990.0 / 44100;
  double regularEnd = salutationEnd + 48 * 3242820.0 / 44100;
  double finalEnd = regularEnd + 3435390.0 / 44100;
  self.scenarios = @[
    @{@"name":@"intro-salutation", @"ids":ids, @"repeats":counts, @"elapsed":@3, @"seconds":@4},
    @{@"name":@"salutation-regular", @"ids":ids, @"repeats":counts, @"elapsed":@(salutationEnd - 2), @"seconds":@4},
    @{@"name":@"regular-repeat", @"ids":ids, @"repeats":counts, @"elapsed":@(salutationEnd + 3242820.0 / 44100 - 2), @"seconds":@4},
    @{@"name":@"regular-final", @"ids":ids, @"repeats":counts, @"elapsed":@(regularEnd - 2), @"seconds":@4},
    @{@"name":@"final-outro", @"ids":ids, @"repeats":counts, @"elapsed":@(finalEnd - 2), @"seconds":@4},
    @{@"name":@"late-98", @"ids":@[@"intro98", @"salutation", @"regular", @"final", @"outro"], @"repeats":@[@1, @1, @97, @1, @1], @"elapsed":@3600, @"seconds":@3},
    @{@"name":@"pause-resume", @"ids":ids, @"repeats":counts, @"elapsed":@600, @"seconds":@2},
    @{@"name":@"end-no-wrap", @"ids":@[@"intro49"], @"repeats":@[@1], @"elapsed":@2, @"seconds":@4},
    @{@"name":@"already-ended", @"ids":@[@"intro49"], @"repeats":@[@1], @"elapsed":@6, @"seconds":@1},
  ];
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, NSEC_PER_SEC), dispatch_get_main_queue(), ^{ [self runNext]; });
  return YES;
}
@end

int main(int argc, char **argv) {
  @autoreleasepool { return UIApplicationMain(argc, argv, nil, NSStringFromClass(Probe.class)); }
}
