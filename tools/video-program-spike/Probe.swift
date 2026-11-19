import UIKit
import AVFoundation
import JavaScriptCore
import MediaToolbox

private func wall() -> Double { Date().timeIntervalSince1970 * 1000 }
private func host() -> Double { CMTimeGetSeconds(CMClockGetTime(CMClockGetHostTimeClock())) }
private func time(_ seconds: Double) -> CMTime { CMTime(seconds: seconds, preferredTimescale: 1_000_000) }
private func argument(_ name: String, default fallback: String) -> String {
    let args = ProcessInfo.processInfo.arguments
    guard let index = args.firstIndex(of: name), index + 1 < args.count else { return fallback }
    return args[index + 1]
}
private func number(_ value: Any?) -> Double { (value as? NSNumber)?.doubleValue ?? 0 }

final class Evidence {
    let directory: URL
    private let file: FileHandle
    var scenario = "setup"
    init() throws {
        let id = argument("--run-id", default: "manual-\(Int(wall()))")
        guard id.range(of: "^[A-Za-z0-9_-]+$", options: .regularExpression) != nil else {
            throw NSError(domain: "InvalidRunID", code: 1)
        }
        directory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent(id, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: false)
        let url = directory.appendingPathComponent("events.jsonl")
        FileManager.default.createFile(atPath: url.path, contents: nil)
        file = try FileHandle(forWritingTo: url)
    }
    func log(_ event: String, _ fields: [String: Any] = [:]) {
        var payload = fields
        payload["event"] = event
        payload["scenario"] = scenario
        payload["wallMs"] = wall()
        payload["host"] = host()
        guard JSONSerialization.isValidJSONObject(payload),
              var bytes = try? JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys]) else { return }
        bytes.append(10)
        file.write(bytes)
    }
    func complete(_ fields: [String: Any]) {
        log("suite-complete", fields)
        file.synchronizeFile()
        if let data = try? JSONSerialization.data(withJSONObject: fields, options: [.prettyPrinted, .sortedKeys]) {
            try? data.write(to: directory.appendingPathComponent("complete.json"), options: .atomic)
        }
    }
    deinit { file.closeFile() }
}

final class ProgramClock {
    let context = JSContext()!
    let timeline: [String: Any]
    let spans: [[String: Any]]
    let timescale: Int32
    let total: Double
    init() throws {
        let script = try String(contentsOf: Bundle.main.url(forResource: "program-core", withExtension: "js")!)
        context.exceptionHandler = { _, error in print("Program core exception: \(String(describing: error))") }
        context.evaluateScript(script)
        let data = try Data(contentsOf: Bundle.main.url(forResource: "program", withExtension: "json")!)
        let definition = try JSONSerialization.jsonObject(with: data)
        let core = context.objectForKeyedSubscript("ProgramCore")!
        guard let t = core.invokeMethod("compileProgram", withArguments: [definition])?.toDictionary() as? [String: Any],
              let s = t["spans"] as? [[String: Any]] else { throw NSError(domain: "ProgramCore", code: 1) }
        timeline = t
        spans = s
        timescale = Int32(number(t["timescale"]))
        total = number(t["totalTicks"]) / Double(timescale)
    }
    func locate(start: Double, now: Double) -> [String: Any] {
        context.objectForKeyedSubscript("ProgramCore")!
            .invokeMethod("locateWallClock", withArguments: [timeline, start, now])!
            .toDictionary() as? [String: Any] ?? [:]
    }
}

final class VideoSurface: UIView {
    override class var layerClass: AnyClass { AVPlayerLayer.self }
    var playerLayer: AVPlayerLayer { layer as! AVPlayerLayer }
}

struct Scenario {
    let name: String
    let offset: Double
    let seconds: Double
    var pauseAfter: Double? = nil
    var resumeAfter: Double? = nil
}

final class ProbeController: UIViewController {
    private let player = AVPlayer()
    private let surface = VideoSurface()
    private let mode = UISegmentedControl(items: ["四段组合", "原长视频对照"])
    private let status = UILabel()
    private let details = UILabel()
    private let progress = UIProgressView(progressViewStyle: .default)
    private let titleLabel = UILabel()
    private let clock: ProgramClock
    private let evidence: Evidence
    private var output: AVPlayerItemVideoOutput?
    private var tap: MTAudioProcessingTap?
    private var itemObservation: NSKeyValueObservation?
    private var playerObservation: NSKeyValueObservation?
    private var readyObservation: NSKeyValueObservation?
    private var notifications: [NSObjectProtocol] = []
    private var displayLink: CADisplayLink?
    private var timer: Timer?
    private var generation = 0
    private var anchor = wall()
    private var wantsPlayback = false
    private var pending = false
    private var waiting = false
    private var lastSample = 0.0
    private var lastDrain = 0.0
    private var lastPosition = -1.0
    private var activeSpan = -1
    private var lastFrameHost = 0.0
    private var scenarios: [Scenario] = []
    private var scenarioIndex = -1
    private var scenarioStart = 0.0
    private var didPause = false
    private var didResume = false
    private var suiteStarted = false
    private var suiteFinished = false
    private var errors = 0
    private var selectedMode = "composition"
    private let suite = argument("--suite", default: "manual")
    private let lead = max(0.1, Double(argument("--lead", default: "0.35")) ?? 0.35)
    private var playbackDuration = 0.0
    private var isAutomated: Bool { suite != "manual" && !suiteFinished }
    private var tapEnabled: Bool { argument("--tap", default: "on") != "off" }

    init(clock: ProgramClock, evidence: Evidence) {
        self.clock = clock
        self.evidence = evidence
        super.init(nibName: nil, bundle: nil)
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(white: 242.0 / 255.0, alpha: 1)
        view.tintColor = UIColor(red: 77.0 / 255.0, green: 188.0 / 255.0, blue: 170.0 / 255.0, alpha: 1)
        titleLabel.text = "星光播放器 · 视频原型"
        titleLabel.font = .boldSystemFont(ofSize: 24)
        titleLabel.textColor = UIColor(white: 0.2, alpha: 1)
        titleLabel.textAlignment = .center
        mode.selectedSegmentIndex = argument("--mode", default: "composition") == "original" ? 1 : 0
        mode.addTarget(self, action: #selector(changeMode), for: .valueChanged)
        surface.backgroundColor = .black
        surface.playerLayer.videoGravity = .resizeAspect
        surface.playerLayer.player = player
        surface.layer.cornerRadius = 12
        surface.clipsToBounds = true
        status.numberOfLines = 3
        status.font = .monospacedDigitSystemFont(ofSize: 17, weight: .medium)
        status.textAlignment = .center
        details.font = .systemFont(ofSize: 12)
        details.textColor = .darkGray
        details.numberOfLines = 0
        details.text = "独立验证 App · 不修改正式版数据\n片头 → 正文48遍 → 特殊末遍 → 片尾\n流程遍次不是本机已完成遍数，以此处流程遍次为准。"
        progress.progressTintColor = view.tintColor
        let row1 = UIStackView(arrangedSubviews: [
            button("从流程开头", #selector(fromStart)), button("模拟迟到10分钟", #selector(joinLate)),
        ])
        let row2 = UIStackView(arrangedSubviews: [
            button("暂停", #selector(pauseTapped)), button("追上当前进度", #selector(resumeTapped)),
            button("停止", #selector(stopTapped)),
        ])
        for row in [row1, row2] { row.axis = .horizontal; row.distribution = .fillEqually; row.spacing = 8 }
        let stack = UIStackView(arrangedSubviews: [titleLabel, mode, surface, status, progress, row1, row2, details])
        stack.axis = .vertical
        stack.spacing = 14
        stack.translatesAutoresizingMaskIntoConstraints = false
        let scroll = UIScrollView()
        scroll.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(scroll)
        scroll.addSubview(stack)
        NSLayoutConstraint.activate([
            scroll.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor),
            scroll.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            scroll.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
            stack.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor, constant: 18),
            stack.trailingAnchor.constraint(equalTo: scroll.contentLayoutGuide.trailingAnchor, constant: -18),
            stack.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor, constant: 16),
            stack.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor, constant: -20),
            stack.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor, constant: -36),
            surface.heightAnchor.constraint(equalTo: surface.widthAnchor, multiplier: 9.0 / 16.0),
            row1.heightAnchor.constraint(equalToConstant: 44), row2.heightAnchor.constraint(equalToConstant: 44),
        ])
        player.automaticallyWaitsToMinimizeStalling = false
        player.volume = 0.35
        player.actionAtItemEnd = .pause
        playerObservation = player.observe(\.timeControlStatus, options: [.new]) { [weak self] player, _ in
            DispatchQueue.main.async {
                self?.evidence.log("time-control", ["value": player.timeControlStatus.rawValue,
                    "reason": player.reasonForWaitingToPlay?.rawValue ?? "", "rate": player.rate])
            }
        }
        readyObservation = surface.playerLayer.observe(\.isReadyForDisplay, options: [.new]) { [weak self] layer, _ in
            DispatchQueue.main.async { self?.evidence.log("layer-ready", ["value": layer.isReadyForDisplay]) }
        }
        for name in [AVPlayerItem.didPlayToEndTimeNotification, AVPlayerItem.playbackStalledNotification,
                     AVPlayerItem.failedToPlayToEndTimeNotification] {
            notifications.append(NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main) {
                [weak self] notification in
                guard let self = self, let item = notification.object as? AVPlayerItem,
                      item === self.player.currentItem else { return }
                self.evidence.log("native-event", ["name": name.rawValue,
                    "position": self.safePosition(), "error": item.error?.localizedDescription ?? ""])
                if name == AVPlayerItem.failedToPlayToEndTimeNotification { self.errors += 1 }
            })
        }
        for name in [UIApplication.didEnterBackgroundNotification, UIApplication.willEnterForegroundNotification,
                     AVAudioSession.interruptionNotification, AVAudioSession.routeChangeNotification] {
            notifications.append(NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main) {
                [weak self] note in
                self?.evidence.log("lifecycle", ["name": note.name.rawValue,
                    "intent": self?.wantsPlayback ?? false])
            })
        }
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback)
            try AVAudioSession.sharedInstance().setActive(true)
        } catch { recordError(error) }
        UIApplication.shared.isIdleTimerDisabled = true
        evidence.log("environment", ["os": UIDevice.current.systemVersion, "model": UIDevice.current.model,
            "suite": suite, "tap": tapEnabled, "leadSeconds": lead, "timescale": clock.timescale,
            "compositionDuration": clock.total, "timeline": clock.timeline,
            "systemOutputLatency": AVAudioSession.sharedInstance().outputLatency,
            "systemIOBufferDuration": AVAudioSession.sharedInstance().ioBufferDuration])
        displayLink = CADisplayLink(target: self, selector: #selector(frame))
        displayLink?.add(to: .main, forMode: .common)
        timer = Timer.scheduledTimer(withTimeInterval: 0.02, repeats: true) { [weak self] _ in self?.tick() }
        loadMode()
    }

    private func button(_ title: String, _ selector: Selector) -> UIButton {
        let button = UIButton(type: .system)
        button.setTitle(title, for: .normal)
        button.setTitleColor(view.tintColor, for: .normal)
        button.backgroundColor = .white
        button.layer.cornerRadius = 8
        button.addTarget(self, action: selector, for: .touchUpInside)
        return button
    }

    private func recordError(_ error: Error) {
        errors += 1
        evidence.log("error", ["message": error.localizedDescription])
        status.text = "验证错误：\(error.localizedDescription)"
    }
    private func safePosition() -> Double {
        let seconds = player.currentTime().seconds
        return seconds.isFinite ? seconds : -1
    }
    private func asset(_ name: String) -> AVURLAsset {
        AVURLAsset(url: Bundle.main.bundleURL.appendingPathComponent("media/\(name)"),
                   options: [AVURLAssetPreferPreciseDurationAndTimingKey: true])
    }
    private func composition() throws -> AVMutableComposition {
        let result = AVMutableComposition()
        let video = result.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)!
        let audio = result.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)!
        var assets: [String: AVURLAsset] = [:]
        for span in clock.spans {
            let name = span["asset"] as! String
            let source = assets[name] ?? asset(name)
            assets[name] = source
            guard let sourceVideo = source.tracks(withMediaType: .video).first,
                  let sourceAudio = source.tracks(withMediaType: .audio).first else {
                throw NSError(domain: "MissingMediaTrack", code: 1)
            }
            let begin = CMTime(value: Int64(number(span["startTicks"])), timescale: clock.timescale)
            let duration = CMTime(value: Int64(number(span["endTicks"]) - number(span["startTicks"])),
                                  timescale: clock.timescale)
            guard abs(sourceAudio.timeRange.duration.seconds - duration.seconds) < 1 / Double(clock.timescale) else {
                throw NSError(domain: "AudioDurationMismatch", code: 1)
            }
            try audio.insertTimeRange(CMTimeRange(start: .zero, duration: duration), of: sourceAudio, at: begin)
            try video.insertTimeRange(CMTimeRange(start: .zero, duration: CMTimeMinimum(duration, sourceVideo.timeRange.duration)),
                                      of: sourceVideo, at: begin)
            evidence.log("composition-span", ["index": span["index"]!, "asset": name,
                "start": begin.seconds, "duration": duration.seconds,
                "sourceAudioDuration": sourceAudio.timeRange.duration.seconds,
                "sourceVideoDuration": sourceVideo.timeRange.duration.seconds])
        }
        guard abs(result.duration.seconds - clock.total) < 1 / Double(clock.timescale) else {
            throw NSError(domain: "CompositionDurationMismatch", code: 1)
        }
        return result
    }

    private func loadMode() {
        generation += 1
        wantsPlayback = false
        pending = false
        player.pause()
        drainAudio()
        itemObservation = nil
        player.replaceCurrentItem(with: nil)
        tap = nil
        selectedMode = mode.selectedSegmentIndex == 0 ? "composition" : "original"
        do {
            let media: AVAsset = selectedMode == "composition" ? try composition() : asset("original.mp4")
            playbackDuration = media.duration.seconds
            let item = AVPlayerItem(asset: media)
            let videoOutput = AVPlayerItemVideoOutput(pixelBufferAttributes: [
                kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
            ])
            item.add(videoOutput)
            output = videoOutput
            if tapEnabled, let audioTrack = media.tracks(withMediaType: .audio).first,
               let raw = VPCreateAudioTap() {
                let audioTap = Unmanaged<MTAudioProcessingTap>.fromOpaque(raw).takeRetainedValue()
                let parameters = AVMutableAudioMixInputParameters(track: audioTrack)
                parameters.audioTapProcessor = audioTap
                let mix = AVMutableAudioMix()
                mix.inputParameters = [parameters]
                item.audioMix = mix
                tap = audioTap
            }
            player.replaceCurrentItem(with: item)
            itemObservation = item.observe(\.status, options: [.initial, .new]) { [weak self] item, _ in
                DispatchQueue.main.async {
                    guard let self = self, item === self.player.currentItem else { return }
                    self.evidence.log("item-status", ["value": item.status.rawValue,
                        "duration": self.playbackDuration, "mode": self.selectedMode,
                        "error": item.error?.localizedDescription ?? ""])
                    if item.status == .failed { self.recordError(item.error ?? NSError(domain: "AVPlayer", code: 1)) }
                    if item.status == .readyToPlay && !self.suiteStarted {
                        self.suiteStarted = true
                        if self.suite == "manual" {
                            self.status.text = "已就绪 · 请选择验证操作"
                        } else { self.prepareSuite(); self.nextScenario() }
                    }
                }
            }
            status.text = "正在准备\(selectedMode == "composition" ? "四段组合时间轴" : "原长视频")…"
        } catch { recordError(error); evidence.complete(["success": false, "errors": errors]) }
    }

    private func position(_ now: Double) -> [String: Any] {
        if selectedMode == "composition" { return clock.locate(start: anchor, now: now) }
        let elapsed = (now - anchor) / 1000
        return ["status": elapsed < 0 ? "waiting" : elapsed >= playbackDuration ? "ended" : "active",
                "elapsedTicks": Int64(floor(elapsed * Double(clock.timescale)))]
    }
    private func begin(offset: Double, reason: String) {
        anchor = wall() - offset * 1000
        activeSpan = -1
        lastFrameHost = 0
        wantsPlayback = true
        synchronize(reason: reason)
    }

    /** Wall-clock target and native host-clock launch share one future deadline.
     * All asynchronous completions must belong to the current generation.
     * Native composition handles every internal boundary without JS reload/seek.
     */
    private func synchronize(reason: String, attempt: Int = 0) {
        generation += 1
        let token = generation
        player.pause()
        player.cancelPendingPrerolls()
        player.currentItem?.cancelPendingSeeks()
        pending = false
        let now = wall()
        let state = position(now)
        guard wantsPlayback else { return }
        if state["status"] as? String == "ended" {
            wantsPlayback = false
            waiting = false
            evidence.log("join-after-end", ["elapsed": (now - anchor) / 1000])
            return
        }
        let untilStart = (anchor - now) / 1000
        if untilStart > lead {
            waiting = true
            evidence.log("waiting", ["startsIn": untilStart])
            return
        }
        waiting = false
        pending = true
        // Prepare BEFORE a known start, so the first media sample is not skipped.
        // For late join keep a future common deadline, shortened near the final tail.
        let launchDelay = untilStart > 0 ? untilStart : min(lead, (playbackDuration + untilStart) / 2)
        let deadlineHost = host() + launchDelay
        let target = untilStart > 0 ? 0 : -untilStart + launchDelay
        let started = host()
        evidence.log("seek-request", ["reason": reason, "target": target,
            "generation": token, "deadlineHost": deadlineHost, "attempt": attempt,
            "anchorMs": anchor, "launchDelay": launchDelay])
        player.seek(to: time(target), toleranceBefore: .zero, toleranceAfter: .zero) { [weak self] finished in
            DispatchQueue.main.async {
                guard let self = self, self.generation == token, self.wantsPlayback else { return }
                self.evidence.log("seek-complete", ["finished": finished, "target": target,
                    "position": self.safePosition(), "latencyMs": (host() - started) * 1000])
                guard finished else { self.pending = false; self.errors += 1; return }
                self.player.preroll(atRate: 1) { [weak self] ready in
                    DispatchQueue.main.async {
                        guard let self = self, self.generation == token, self.wantsPlayback else { return }
                        let remaining = deadlineHost - host()
                        self.evidence.log("preroll-complete", ["ready": ready,
                            "remainingMs": remaining * 1000, "latencyMs": (host() - started) * 1000])
                        guard ready else { self.pending = false; self.errors += 1; return }
                        if remaining < 0.04 {
                            if attempt < 2 { self.synchronize(reason: "\(reason)-retry", attempt: attempt + 1) }
                            else {
                                self.pending = false
                                self.wantsPlayback = false
                                self.errors += 1
                                self.evidence.log("missed-deadline", ["attempt": attempt])
                            }
                            return
                        }
                        self.player.setRate(1, time: time(target), atHostTime: time(deadlineHost))
                        self.pending = false
                        self.evidence.log("scheduled-play", ["target": target,
                            "deadlineHost": deadlineHost, "generation": token])
                    }
                }
            }
        }
    }

    private func pause(reason: String) {
        wantsPlayback = false
        waiting = false
        pending = false
        generation += 1
        player.cancelPendingPrerolls()
        player.currentItem?.cancelPendingSeeks()
        player.pause()
        evidence.log(reason, ["position": safePosition(), "elapsed": (wall() - anchor) / 1000])
    }
    @objc private func changeMode() {
        guard !isAutomated else { return }
        suiteStarted = false
        loadMode()
    }
    @objc private func fromStart() { guard !isAutomated else { return }; evidence.scenario = "manual-start"; begin(offset: -1, reason: "join") }
    @objc private func joinLate() { guard !isAutomated else { return }; evidence.scenario = "manual-late"; begin(offset: 600, reason: "join") }
    @objc private func pauseTapped() { guard !isAutomated else { return }; pause(reason: "user-pause") }
    @objc private func stopTapped() { guard !isAutomated else { return }; pause(reason: "user-stop") }
    @objc private func resumeTapped() {
        guard !isAutomated else { return }
        wantsPlayback = true
        synchronize(reason: "user-resume")
    }

    private func prepareSuite() {
        if suite == "full" {
            scenarios = [Scenario(name: "full-real-time", offset: -1, seconds: playbackDuration + 3)]
        } else if suite == "continuity" {
            scenarios = [Scenario(name: "three-cycles-continuous", offset: -1, seconds: 42.28 + 73.76 * 3 + 4)]
        } else {
            if selectedMode == "original" {
                scenarios = zip(["intro-to-regular", "regular-to-regular", "regular-to-final", "final-to-outro"],
                                [42.28, 116.16, 3583.52, 3661.36]).map {
                    Scenario(name: "original-\($0.0)", offset: $0.1 - 2, seconds: 4.8)
                }
            } else {
                let indices = suite == "boundaries" ? Array(1..<clock.spans.count) : [1, 2, 49, 50]
                scenarios = indices.map { index in
                    Scenario(name: "boundary-\(index)",
                             offset: number(clock.spans[index]["startTicks"]) / Double(clock.timescale) - 2,
                             seconds: 4.8)
                }
            }
            scenarios += [
                Scenario(name: "late-join-pause-resume", offset: 600, seconds: 11, pauseAfter: 3, resumeAfter: 6),
                Scenario(name: "pause-cancels-pending-seek", offset: 700, seconds: 2, pauseAfter: 0.02),
                Scenario(name: "future-start", offset: -1, seconds: 3),
                Scenario(name: "natural-end", offset: playbackDuration - 3, seconds: 5),
                Scenario(name: "after-end", offset: playbackDuration + 10, seconds: 1),
            ]
        }
        evidence.log("suite-plan", ["mode": selectedMode, "cases": scenarios.map { [
            "name": $0.name, "offset": $0.offset, "seconds": $0.seconds,
        ] }, "realTimeRate": 1])
    }
    private func nextScenario() {
        pause(reason: "scenario-stop")
        drainAudio()
        if scenarioIndex >= 0 { evidence.log("scenario-end", ["index": scenarioIndex]) }
        scenarioIndex += 1
        if scenarioIndex >= scenarios.count {
            suiteFinished = true
            status.text = "自动播放完成 · 等待分析日志"
            evidence.complete(["success": errors == 0, "errors": errors, "mode": selectedMode,
                "suite": suite, "scenarioCount": scenarios.count, "finishedAtMs": wall(),
                "note": "Harness completion only; assertions live in analyze.mjs. Not physical speaker measurement."])
            return
        }
        let scenario = scenarios[scenarioIndex]
        evidence.scenario = scenario.name
        didPause = false
        didResume = false
        scenarioStart = host()
        evidence.log("scenario-start", ["offset": scenario.offset, "seconds": scenario.seconds,
            "index": scenarioIndex, "mode": selectedMode])
        begin(offset: scenario.offset, reason: "scenario-join")
    }

    private func tick() {
        let nowHost = host()
        let now = wall()
        if waiting && wantsPlayback && now >= anchor - lead * 1000 { synchronize(reason: "scheduled-start") }
        if nowHost - lastDrain >= 0.5 { drainAudio(); lastDrain = nowHost }
        if nowHost - lastSample >= 0.1 {
            lastSample = nowHost
            let point = position(now)
            let elapsed = (now - anchor) / 1000
            let media = safePosition()
            let span = point["span"] as? [String: Any]
            if let span = span {
                let index = Int(number(span["index"]))
                if index != activeSpan {
                    activeSpan = index
                    evidence.log("wall-span", ["index": index, "cycle": span["cycle"] ?? NSNull(),
                        "role": span["role"] ?? "", "elapsed": elapsed, "position": media])
                }
            }
            evidence.log("sample", ["elapsed": elapsed, "position": media, "driftMs": (media - elapsed) * 1000,
                "intent": wantsPlayback, "pending": pending, "rate": player.rate,
                "timeControl": player.timeControlStatus.rawValue, "layerReady": surface.playerLayer.isReadyForDisplay,
                "frameAgeMs": lastFrameHost == 0 ? -1 : (nowHost - lastFrameHost) * 1000,
                "positionDelta": lastPosition < 0 ? 0 : media - lastPosition])
            lastPosition = media
            progress.progress = Float(max(0, min(1, media / playbackDuration)))
            let cycle = span?["cycle"] as? NSNumber
            status.text = "\(selectedMode == "composition" ? "四段组合" : "原长视频") · \(evidence.scenario)\n" +
                "\(cycle == nil ? (span?["role"] as? String ?? "") : "流程第 \(cycle!) / 49 遍")  " +
                String(format: "%.2f / %.2f 秒\n时间轴偏差 %+.0f ms", media, playbackDuration, (media - elapsed) * 1000)
            if wantsPlayback && elapsed >= playbackDuration {
                pause(reason: "wall-end")
            }
        }
        if isAutomated && scenarioIndex >= 0 && scenarioIndex < scenarios.count {
            let scenario = scenarios[scenarioIndex]
            let elapsed = nowHost - scenarioStart
            if let at = scenario.pauseAfter, !didPause && elapsed >= at {
                didPause = true
                pause(reason: "test-pause")
            }
            if let at = scenario.resumeAfter, !didResume && elapsed >= at {
                didResume = true
                wantsPlayback = true
                synchronize(reason: "test-resume")
            }
            if elapsed >= scenario.seconds { nextScenario() }
        }
    }
    @objc private func frame() {
        guard let output = output else { return }
        let now = host()
        let requested = output.itemTime(forHostTime: now)
        guard output.hasNewPixelBuffer(forItemTime: requested) else { return }
        var actual = CMTime.invalid
        guard output.copyPixelBuffer(forItemTime: requested, itemTimeForDisplay: &actual) != nil,
              actual.seconds.isFinite else { return }
        let gap = lastFrameHost > 0 ? (now - lastFrameHost) * 1000 : 0
        lastFrameHost = now
        evidence.log("video-frame", ["pts": actual.seconds, "gapMs": gap,
            "elapsed": (wall() - anchor) / 1000, "intent": wantsPlayback, "rate": player.rate])
    }
    private func drainAudio() {
        guard let tap = tap else { return }
        let opaque = Unmanaged.passUnretained(tap).toOpaque()
        var records = [VPAudioRecord](repeating: VPAudioRecord(), count: 1024)
        let count = VPDrainAudioTap(opaque, &records, records.count)
        for record in records.prefix(count) {
            evidence.log("audio-buffer", ["sourceHost": record.host_seconds,
                "pts": record.start_seconds, "duration": record.duration_seconds,
                "rms": record.rms.isFinite ? record.rms : -1, "frames": record.frames,
                "sampleRate": record.sample_rate, "status": record.status, "flags": record.flags])
        }
        let dropped = VPAudioTapDropped(opaque)
        if dropped > 0 { evidence.log("audio-ring-overflow", ["dropped": dropped]) }
    }
}

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?
    func application(_ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        let window = UIWindow(frame: UIScreen.main.bounds)
        self.window = window
        do {
            let evidence = try Evidence()
            window.rootViewController = ProbeController(clock: try ProgramClock(), evidence: evidence)
        } catch {
            let controller = UIViewController()
            controller.view.backgroundColor = .white
            let label = UILabel(frame: CGRect(x: 20, y: 100, width: 340, height: 300))
            label.numberOfLines = 0
            label.text = "原型初始化失败：\(error)"
            controller.view.addSubview(label)
            window.rootViewController = controller
        }
        window.makeKeyAndVisible()
        return true
    }
}
