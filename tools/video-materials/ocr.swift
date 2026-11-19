import Foundation
import Vision

// Read-only OCR evidence, not an aesthetic or pixel-perfect acceptance test.
for filename in CommandLine.arguments.dropFirst() {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.recognitionLanguages = ["zh-Hans", "en-US"]
    request.usesLanguageCorrection = false
    do {
        try VNImageRequestHandler(url: URL(fileURLWithPath: filename)).perform([request])
        let items = (request.results ?? []).compactMap { result -> [String: Any]? in
            guard let candidate = result.topCandidates(1).first else { return nil }
            let box = result.boundingBox
            return ["text": candidate.string, "confidence": candidate.confidence,
                    "x": box.minX, "y": box.minY, "w": box.width, "h": box.height]
        }
        let json = try JSONSerialization.data(
            withJSONObject: ["file": filename, "items": items], options: [.sortedKeys])
        print(String(data: json, encoding: .utf8)!)
    } catch {
        fputs("\(filename): \(error)\n", stderr)
        exit(1)
    }
}
