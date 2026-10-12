#import <React/RCTBridgeModule.h>

@interface PlayerCommandLock : NSObject <RCTBridgeModule>
@end

@implementation PlayerCommandLock

static const NSTimeInterval PlayerCommandLeaseTimeout = 30.0;
static dispatch_queue_t PlayerCommandStateQueue;
static NSString *PlayerCommandOwner;
static NSMutableArray<NSDictionary *> *PlayerCommandWaiters;
static NSUInteger PlayerCommandLeaseGeneration;

+ (void)initialize
{
  if (self == [PlayerCommandLock class]) {
    PlayerCommandStateQueue = dispatch_queue_create("com.starlightplayer.command-lock", DISPATCH_QUEUE_SERIAL);
    PlayerCommandWaiters = [NSMutableArray new];
  }
}

RCT_EXPORT_MODULE();

+ (void)scheduleLeaseForToken:(NSString *)token
{
  PlayerCommandLeaseGeneration += 1;
  NSUInteger generation = PlayerCommandLeaseGeneration;
  dispatch_after(
    dispatch_time(DISPATCH_TIME_NOW, (int64_t)(PlayerCommandLeaseTimeout * NSEC_PER_SEC)),
    PlayerCommandStateQueue,
    ^{
      if (generation == PlayerCommandLeaseGeneration &&
          [PlayerCommandOwner isEqualToString:token]) {
        [self releaseToken:token];
      }
    }
  );
}

+ (void)releaseToken:(NSString *)token
{
  if (![PlayerCommandOwner isEqualToString:token]) return;
  PlayerCommandLeaseGeneration += 1;

  if (PlayerCommandWaiters.count == 0) {
    PlayerCommandOwner = nil;
    return;
  }

  NSDictionary *next = PlayerCommandWaiters.firstObject;
  [PlayerCommandWaiters removeObjectAtIndex:0];
  PlayerCommandOwner = next[@"token"];
  RCTPromiseResolveBlock resolve = next[@"resolve"];
  [self scheduleLeaseForToken:PlayerCommandOwner];
  resolve(nil);
}

RCT_REMAP_METHOD(acquire,
                 acquireWithToken:(NSString *)token
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(__unused RCTPromiseRejectBlock)reject)
{
  dispatch_async(PlayerCommandStateQueue, ^{
    if (PlayerCommandOwner == nil) {
      PlayerCommandOwner = [token copy];
      [PlayerCommandLock scheduleLeaseForToken:PlayerCommandOwner];
      resolve(nil);
      return;
    }
    [PlayerCommandWaiters addObject:@{
      @"token": [token copy],
      @"resolve": [resolve copy],
    }];
  });
}

RCT_EXPORT_METHOD(release:(NSString *)token)
{
  dispatch_async(PlayerCommandStateQueue, ^{
    [PlayerCommandLock releaseToken:token];
  });
}

RCT_EXPORT_METHOD(renew:(NSString *)token)
{
  dispatch_async(PlayerCommandStateQueue, ^{
    if ([PlayerCommandOwner isEqualToString:token]) {
      [PlayerCommandLock scheduleLeaseForToken:token];
    }
  });
}

@end
