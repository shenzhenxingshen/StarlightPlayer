#import <UIKit/UIKit.h>
#import <XCTest/XCTest.h>

@interface StarlightPlayerTests : XCTestCase
@end

@implementation StarlightPlayerTests

- (void)testRootViewControllerExists
{
  UIViewController *vc = [[[UIApplication sharedApplication] delegate] window].rootViewController;
  XCTAssertNotNil(vc, @"Root view controller should exist");
}

@end
