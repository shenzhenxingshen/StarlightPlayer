#import <React/RCTBridgeModule.h>
#import <React/RCTViewManager.h>
#import <AVFoundation/AVFoundation.h>
#import <UIKit/UIKit.h>

// A single native composition, not a JS QueueEnded/restart loop. All offsets are
// exact manifest ticks. Repeated clips reference the same bundled file.
@interface SLVideoEngine : NSObject
@property(nonatomic, strong) AVPlayer *player;
@property(nonatomic) NSUInteger generation;
@property(nonatomic) double origin;
@property(nonatomic, copy) NSString *error;
+ (instancetype)shared;
- (void)pause;
@end

@implementation SLVideoEngine
+ (instancetype)shared {
  static SLVideoEngine *engine;
  static dispatch_once_t once;
  dispatch_once(&once, ^{ engine = [SLVideoEngine new]; });
  return engine;
}
- (instancetype)init {
  if ((self = [super init])) {
    _player = [AVPlayer new];
    _player.automaticallyWaitsToMinimizeStalling = NO;
    _player.actionAtItemEnd = AVPlayerActionAtItemEndPause;
    NSNotificationCenter *center = NSNotificationCenter.defaultCenter;
    [center addObserver:self selector:@selector(background:) name:UIApplicationWillResignActiveNotification object:nil];
    [center addObserver:self selector:@selector(interruption:) name:AVAudioSessionInterruptionNotification object:nil];
    [center addObserver:self selector:@selector(routeChanged:) name:AVAudioSessionRouteChangeNotification object:nil];
    [center addObserver:self selector:@selector(finished:) name:AVPlayerItemDidPlayToEndTimeNotification object:nil];
  }
  return self;
}
- (void)pause {
  self.generation++;
  [self.player.currentItem cancelPendingSeeks];
  [self.player cancelPendingPrerolls];
  [self.player pause];
  UIApplication.sharedApplication.idleTimerDisabled = NO;
}
- (void)background:(NSNotification *)note { [self pause]; }
- (void)interruption:(NSNotification *)note {
  if ([note.userInfo[AVAudioSessionInterruptionTypeKey] unsignedIntegerValue] == AVAudioSessionInterruptionTypeBegan) {
    [self pause]; self.error = @"音频被系统中断，请点“追平并继续”";
  }
}
- (void)routeChanged:(NSNotification *)note {
  if ([note.userInfo[AVAudioSessionRouteChangeReasonKey] unsignedIntegerValue] == AVAudioSessionRouteChangeReasonOldDeviceUnavailable) {
    [self pause]; self.error = @"音频设备已断开，请点“追平并继续”";
  }
}
- (void)finished:(NSNotification *)note {
  if (note.object == self.player.currentItem) UIApplication.sharedApplication.idleTimerDisabled = NO;
}
@end

@interface VideoProgramPlayer : NSObject <RCTBridgeModule>
@end

@implementation VideoProgramPlayer
RCT_EXPORT_MODULE();
+ (BOOL)requiresMainQueueSetup { return YES; }
- (dispatch_queue_t)methodQueue { return dispatch_get_main_queue(); }

- (void)monitor:(NSUInteger)generation {
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 500 * NSEC_PER_MSEC), dispatch_get_main_queue(), ^{
    SLVideoEngine *engine = SLVideoEngine.shared;
    if (engine.generation != generation || !engine.player.currentItem) return;
    double expected = NSDate.date.timeIntervalSince1970 - engine.origin;
    double duration = CMTimeGetSeconds(engine.player.currentItem.duration);
    double actual = CMTimeGetSeconds(engine.player.currentTime);
    if (expected < 0 || (isfinite(duration) && expected >= duration)) { [engine pause]; return; }
    // Ordinary segment boundaries run entirely in the native composition. Only a
    // stall/clock adjustment exceeding 250ms triggers a new host-clock alignment.
    if (engine.player.rate != 0 && isfinite(actual) && fabs(actual - expected) > 0.25) {
      [engine.player pause];
      __block BOOL settled = NO;
      RCTPromiseRejectBlock fail = ^(NSString *code, NSString *message, NSError *error) {
        if (settled) return;
        settled = YES;
        if (engine.generation == generation) { [engine pause]; engine.error = message; }
      };
      dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 6 * NSEC_PER_SEC), dispatch_get_main_queue(), ^{
        fail(@"video_timeout", @"视频重新对齐超时，请点“追平并继续”", nil);
      });
      [self align:generation attempt:0 resolve:^(id result) {
        if (settled) return;
        settled = YES;
        [self monitor:generation];
      } reject:fail];
      return;
    }
    [self monitor:generation];
  });
}

- (void)align:(NSUInteger)generation attempt:(int)attempt
      resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  SLVideoEngine *engine = SLVideoEngine.shared;
  if (engine.generation != generation) { reject(@"video_cancelled", @"Video command superseded", nil); return; }
  if (UIApplication.sharedApplication.applicationState != UIApplicationStateActive) {
    reject(@"video_background", @"Video requires the foreground", nil); return;
  }
  double now = NSDate.date.timeIntervalSince1970;
  double targetWall = now + 0.35;
  double target = targetWall - engine.origin;
  double duration = CMTimeGetSeconds(engine.player.currentItem.duration);
  if (!isfinite(duration) || target < 0 || target >= duration) {
    [engine pause]; reject(@"video_window", @"视频流程尚未开始或已经结束", nil); return;
  }
  CMTime targetTime = CMTimeMakeWithSeconds(target, 44100);
  [engine.player seekToTime:targetTime toleranceBefore:kCMTimeZero toleranceAfter:kCMTimeZero
         completionHandler:^(BOOL finished) {
    dispatch_async(dispatch_get_main_queue(), ^{
      if (engine.generation != generation || !finished) { reject(@"video_cancelled", @"Video seek cancelled", nil); return; }
      [engine.player prerollAtRate:1 completionHandler:^(BOOL ready) {
        dispatch_async(dispatch_get_main_queue(), ^{
          if (engine.generation != generation) { reject(@"video_cancelled", @"Video preroll cancelled", nil); return; }
          double remaining = targetWall - NSDate.date.timeIntervalSince1970;
          if (!ready || remaining < 0.02) {
            if (attempt < 3) [self align:generation attempt:attempt + 1 resolve:resolve reject:reject];
            else { [engine pause]; reject(@"video_slow", @"视频准备超时，请重试", nil); }
            return;
          }
          CMTime host = CMClockGetTime(CMClockGetHostTimeClock());
          [engine.player setRate:1 time:targetTime atHostTime:CMTimeAdd(host, CMTimeMakeWithSeconds(remaining, 1000000000))];
          UIApplication.sharedApplication.idleTimerDisabled = YES;
          resolve(nil);
        });
      }];
    });
  }];
}

- (void)awaitReady:(NSUInteger)generation deadline:(double)deadline
           resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  SLVideoEngine *engine = SLVideoEngine.shared;
  if (engine.generation != generation) { reject(@"video_cancelled", @"Video command superseded", nil); return; }
  if (engine.player.currentItem.status == AVPlayerItemStatusFailed ||
      NSDate.date.timeIntervalSince1970 > deadline) {
    engine.error = engine.player.currentItem.error.localizedDescription ?: @"视频加载超时";
    reject(@"video_load", engine.error, engine.player.currentItem.error); return;
  }
  if (engine.player.currentItem.status == AVPlayerItemStatusReadyToPlay) {
    [self align:generation attempt:0 resolve:resolve reject:reject]; return;
  }
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 50 * NSEC_PER_MSEC), dispatch_get_main_queue(), ^{
    [self awaitReady:generation deadline:deadline resolve:resolve reject:reject];
  });
}

RCT_EXPORT_METHOD(load:(NSDictionary *)config resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  SLVideoEngine *engine = SLVideoEngine.shared;
  [engine pause];
  NSUInteger generation = engine.generation;
  // Seek/preroll callbacks are not guaranteed after every system interruption.
  // Bound the complete operation so the shared JS command lock cannot hang.
  __block BOOL settled = NO;
  RCTPromiseRejectBlock fail = ^(NSString *code, NSString *message, NSError *error) {
    if (settled) return;
    settled = YES;
    if (engine.generation == generation) { [engine pause]; engine.error = message; }
    reject(code, message, error);
  };
  RCTPromiseResolveBlock succeed = ^(id result) {
    if (settled) return;
    settled = YES;
    [self monitor:generation];
    resolve(result);
  };
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 20 * NSEC_PER_SEC), dispatch_get_main_queue(), ^{
    fail(@"video_timeout", @"视频加载或对齐超时，请重试", nil);
  });
  engine.error = nil;
  engine.origin = [config[@"startEpochMs"] doubleValue] / 1000.0;
  NSArray *spans = config[@"spans"];
  if ([config[@"timescale"] intValue] != 44100 || !isfinite(engine.origin) ||
      ![spans isKindOfClass:NSArray.class] || spans.count == 0 || spans.count > 1000) {
    fail(@"video_config", @"Invalid video program", nil); return;
  }
  // Asset loading/composition assembly can be expensive; never block UIKit.
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    NSError *error = nil;
    NSURL *directory = [NSBundle.mainBundle.resourceURL URLByAppendingPathComponent:@"video" isDirectory:YES];
    NSData *data = [NSData dataWithContentsOfURL:[directory URLByAppendingPathComponent:@"manifest.json"]];
    NSDictionary *manifest = data ? [NSJSONSerialization JSONObjectWithData:data options:0 error:&error] : nil;
    NSMutableDictionary *catalog = [NSMutableDictionary new];
    for (NSDictionary *entry in manifest[@"assets"]) catalog[entry[@"file"]] = entry;
    AVMutableComposition *composition = [AVMutableComposition composition];
    AVMutableCompositionTrack *video = [composition addMutableTrackWithMediaType:AVMediaTypeVideo preferredTrackID:kCMPersistentTrackID_Invalid];
    AVMutableCompositionTrack *audio = [composition addMutableTrackWithMediaType:AVMediaTypeAudio preferredTrackID:kCMPersistentTrackID_Invalid];
    CMTime cursor = kCMTimeZero;
    NSMutableDictionary<NSString *, AVURLAsset *> *assets = [NSMutableDictionary new];
    for (NSDictionary *span in spans) {
      NSString *file = span[@"file"];
      NSDictionary *entry = [file isKindOfClass:NSString.class] ? catalog[file] : nil;
      int64_t ticks = [span[@"durationTicks"] longLongValue];
      if (!entry || ticks <= 0 || ticks != [entry[@"durationTicks"] longLongValue]) {
        error = [NSError errorWithDomain:@"StarlightVideo" code:1 userInfo:@{NSLocalizedDescriptionKey: @"视频素材清单不匹配"}]; break;
      }
      AVURLAsset *asset = assets[file];
      if (!asset) {
        asset = [AVURLAsset URLAssetWithURL:[directory URLByAppendingPathComponent:file]
                                  options:@{AVURLAssetPreferPreciseDurationAndTimingKey:@YES}];
        assets[file] = asset;
      }
      AVAssetTrack *v = [asset tracksWithMediaType:AVMediaTypeVideo].firstObject;
      AVAssetTrack *a = [asset tracksWithMediaType:AVMediaTypeAudio].firstObject;
      CMTime duration = CMTimeMake(ticks, 44100);
      if (!v || !a || CMTimeCompare(v.timeRange.duration, duration) < 0) {
        error = [NSError errorWithDomain:@"StarlightVideo" code:2 userInfo:@{NSLocalizedDescriptionKey: @"视频素材缺失或时长不足"}]; break;
      }
      if (![video insertTimeRange:CMTimeRangeMake(v.timeRange.start, duration) ofTrack:v atTime:cursor error:&error]) break;
      CMTime audioDuration = CMTimeMinimum(a.timeRange.duration, duration);
      if (![audio insertTimeRange:CMTimeRangeMake(a.timeRange.start, audioDuration) ofTrack:a atTime:cursor error:&error]) break;
      cursor = CMTimeAdd(cursor, duration);
      if (CMTimeGetSeconds(cursor) >= 86400) {
        error = [NSError errorWithDomain:@"StarlightVideo" code:3 userInfo:@{NSLocalizedDescriptionKey: @"视频流程过长"}]; break;
      }
    }
    dispatch_async(dispatch_get_main_queue(), ^{
      if (generation != engine.generation) { fail(@"video_cancelled", @"Video command superseded", nil); return; }
      if (error || !catalog.count) {
        engine.error = error.localizedDescription ?: @"未打包视频素材";
        fail(@"video_assets", engine.error, error); return;
      }
      NSError *sessionError = nil;
      AVAudioSession *session = AVAudioSession.sharedInstance;
      [session setCategory:AVAudioSessionCategoryPlayback error:&sessionError];
      if (!sessionError) [session setActive:YES error:&sessionError];
      if (sessionError) { fail(@"video_audio", sessionError.localizedDescription, sessionError); return; }
      [engine.player replaceCurrentItemWithPlayerItem:[AVPlayerItem playerItemWithAsset:composition]];
      [self awaitReady:generation deadline:NSDate.date.timeIntervalSince1970 + 15 resolve:succeed reject:fail];
    });
  });
}
RCT_EXPORT_METHOD(pause:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  [SLVideoEngine.shared pause]; resolve(nil);
}
RCT_EXPORT_METHOD(stop:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  [SLVideoEngine.shared pause];
  [SLVideoEngine.shared.player replaceCurrentItemWithPlayerItem:nil];
  resolve(nil);
}
RCT_EXPORT_METHOD(getStatus:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  SLVideoEngine *e = SLVideoEngine.shared;
  double position = CMTimeGetSeconds(e.player.currentTime);
  resolve(@{@"position": @(isfinite(position) ? position : 0),
            @"playing": @(e.player.rate != 0),
            @"error": e.error ?: e.player.currentItem.error.localizedDescription ?: @""});
}
@end

@interface SLVideoView : UIView
@end
@implementation SLVideoView
+ (Class)layerClass { return AVPlayerLayer.class; }
- (instancetype)init {
  if ((self = [super init])) {
    AVPlayerLayer *layer = (AVPlayerLayer *)self.layer;
    layer.player = SLVideoEngine.shared.player;
    layer.videoGravity = AVLayerVideoGravityResizeAspect;
    self.backgroundColor = UIColor.blackColor;
  }
  return self;
}
@end
@interface VideoProgramView : RCTViewManager
@end
@implementation VideoProgramView
RCT_EXPORT_MODULE();
+ (BOOL)requiresMainQueueSetup { return YES; }
- (UIView *)view { return [SLVideoView new]; }
@end
