#import <React/RCTBridgeModule.h>
#import <React/RCTUtils.h>
#import <UIKit/UIKit.h>

@interface DiagnosticExporter : NSObject <RCTBridgeModule>
@end

@implementation DiagnosticExporter

RCT_EXPORT_MODULE();

RCT_REMAP_METHOD(shareTextFile,
                 shareTextFileWithContent:(NSString *)content
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  NSDateFormatter *formatter = [NSDateFormatter new];
  formatter.locale = [NSLocale localeWithLocaleIdentifier:@"en_US_POSIX"];
  formatter.dateFormat = @"yyyyMMdd-HHmmss";
  NSString *filename = [NSString stringWithFormat:@"starlight-diagnostics-%@.txt",
                        [formatter stringFromDate:[NSDate date]]];
  NSString *path = [NSTemporaryDirectory() stringByAppendingPathComponent:filename];
  NSError *writeError = nil;
  BOOL written = [content writeToFile:path
                            atomically:YES
                              encoding:NSUTF8StringEncoding
                                 error:&writeError];
  if (!written) {
    reject(@"diagnostic_export_failed", writeError.localizedDescription, writeError);
    return;
  }

  dispatch_async(dispatch_get_main_queue(), ^{
    UIViewController *presentingController = RCTPresentedViewController();
    if (presentingController == nil) {
      reject(@"diagnostic_export_failed", @"当前没有可用的界面，请打开 App 后重试", nil);
      return;
    }

    NSURL *fileURL = [NSURL fileURLWithPath:path];
    UIActivityViewController *activityController =
      [[UIActivityViewController alloc] initWithActivityItems:@[fileURL]
                                        applicationActivities:nil];
    if (activityController.popoverPresentationController != nil) {
      activityController.popoverPresentationController.sourceView = presentingController.view;
      activityController.popoverPresentationController.sourceRect = CGRectMake(
        CGRectGetMidX(presentingController.view.bounds),
        CGRectGetMidY(presentingController.view.bounds),
        1,
        1
      );
    }
    [presentingController presentViewController:activityController animated:YES completion:^{
      resolve(path);
    }];
  });
}

@end
