#import <Foundation/Foundation.h>
// Test-only bridge facade. Playback code below is the unmodified production .mm;
// this facade removes only React registration, not AVFoundation behavior.
typedef void (^RCTPromiseResolveBlock)(id result);
typedef void (^RCTPromiseRejectBlock)(NSString *code, NSString *message, NSError *error);
@protocol RCTBridgeModule <NSObject>
@end
#define RCT_EXPORT_MODULE(...)
#define RCT_EXPORT_METHOD(method) - (void)method
