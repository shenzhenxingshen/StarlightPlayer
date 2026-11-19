import AppKit
import JavaScriptCore

private func wall() -> Double { Date().timeIntervalSince1970 * 1000 }
private func host() -> Double { ProcessInfo.processInfo.systemUptime }
private func number(_ v: Any?) -> Double { (v as? NSNumber)?.doubleValue ?? 0 }
private func argument(_ key: String, _ fallback: String) -> String {
    let args = ProcessInfo.processInfo.arguments
    guard let i = args.firstIndex(of: key), i + 1 < args.count else { return fallback }
    return args[i + 1]
}
private let accent = NSColor(srgbRed: 77/255, green: 188/255, blue: 170/255, alpha: 1)

final class ProgramClock {
    private let context = JSContext()!
    let timeline: [String: Any]
    let spans: [[String: Any]]
    let total: Double
    let scale: Double
    init() throws {
        let resources = Bundle.main.resourceURL!
        context.evaluateScript(try String(contentsOf: resources.appendingPathComponent("program-core.js"), encoding: .utf8))
        let definition = try JSONSerialization.jsonObject(with:
            Data(contentsOf: resources.appendingPathComponent("program.json")))
        guard let compiled = context.objectForKeyedSubscript("ProgramCore")?
            .invokeMethod("compileProgram", withArguments: [definition])?.toDictionary() as? [String: Any],
              let entries = compiled["spans"] as? [[String: Any]] else {
            throw NSError(domain: "ProgramCore", code: 1)
        }
        timeline = compiled; spans = entries; scale = number(compiled["timescale"])
        total = number(compiled["totalTicks"]) / scale
    }
    func locate(_ anchor: Double, _ now: Double) -> [String: Any] {
        context.objectForKeyedSubscript("ProgramCore")!
            .invokeMethod("locateWallClock", withArguments: [timeline, anchor, now])!.toDictionary() as? [String: Any] ?? [:]
    }
}

final class Evidence {
    let directory: URL
    let file: FileHandle
    var scenario = "setup"
    init() throws {
        let fallback = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Logs/StarlightVideoPrototype").path
        let parent = URL(fileURLWithPath: argument("--output", fallback), isDirectory: true)
        directory = parent.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let path = directory.appendingPathComponent("events.jsonl")
        FileManager.default.createFile(atPath: path.path, contents: nil)
        file = try FileHandle(forWritingTo: path)
    }
    func log(_ event: String, _ fields: [String: Any] = [:]) {
        var row = fields
        row["event"] = event; row["scenario"] = scenario; row["wallMs"] = wall(); row["host"] = host()
        guard JSONSerialization.isValidJSONObject(row),
              var data = try? JSONSerialization.data(withJSONObject: row, options: [.sortedKeys]) else { return }
        data.append(10); file.write(data)
    }
    func complete(_ errors: Int) {
        log("suite-complete", ["errors": errors])
        file.synchronizeFile()
        try? JSONSerialization.data(withJSONObject: ["errors": errors]).write(
            to: directory.appendingPathComponent("complete.json"), options: .atomic)
    }
}

struct Scenario {
    let name: String
    let offset: Double
    let seconds: Double
    var pauseAt: Double? = nil
    var resumeAt: Double? = nil
    var stopAt: Double? = nil
}

struct Preparation {
    let generation: Int
    let target: Double
    let deadline: Double
    let started: Double
    let restart: Int
    let retry: Int
    var acknowledged = false
    var ready = false
}

final class Preview: NSObject, NSApplicationDelegate, NSWindowDelegate {
    var window: NSWindow!
    let image = NSImageView()
    let status = NSTextField(labelWithString: "正在准备四段素材…")
    let timing = NSTextField(labelWithString: "")
    let progress = NSProgressIndicator()
    var buttons: [NSButton] = []
    var engine: OpaquePointer?
    var clock: ProgramClock!
    var evidence: Evidence!
    var timer: Timer?
    var pixels = [UInt8](repeating: 0, count: 864 * 486 * 4)
    var frames: UInt64 = 0
    var lastSample = 0.0
    var sequence: UInt64 = 0
    var replies: [UInt64: (Int, () -> Void)] = [:]
    var generation = 0
    var restarts = 0
    var anchor: Double?
    var state = "loading"
    var ready = false
    var preparation: Preparation?
    var errors = 0
    let suite = argument("--suite", "manual")
    var scenarios: [Scenario] = []
    var scenarioIndex = -1
    var scenarioStart = 0.0
    var pausedInScenario = false
    var resumedInScenario = false
    var stoppedInScenario = false
    var suiteFinished = false
    var lastSpan = -1

    func applicationDidFinishLaunching(_ note: Notification) {
        do {
            evidence = try Evidence()
            clock = try ProgramClock()
            buildWindow()
            var buffer = [CChar](repeating: 0, count: 512)
            engine = video_create(suite == "manual" ? 0 : 1, &buffer, buffer.count)
            guard engine != nil else { throw NSError(domain: String(cString: buffer), code: 1) }
            evidence.log("environment", ["engine": String(cString: video_version(engine)),
                "suite": suite, "timeline": clock.timeline, "renderer": "libmpv-sw-864x486",
                "os": ProcessInfo.processInfo.operatingSystemVersionString,
                "productionIntegration": false])
            prepareScenarios()
            command("loadfile", Bundle.main.resourceURL!.appendingPathComponent("program.edl").path, "replace")
            timer = Timer.scheduledTimer(withTimeInterval: 0.01, repeats: true) { [weak self] _ in self?.tick() }
            if suite != "manual" {
                DispatchQueue.main.asyncAfter(deadline: .now() + 15) { [weak self] in
                    guard let self = self, !self.ready else { return }
                    self.fail("媒体加载超时"); self.finish()
                }
            }
        } catch {
            let alert = NSAlert(); alert.messageText = "无法启动视频原型"
            alert.informativeText = error.localizedDescription; alert.runModal()
            NSApp.terminate(nil)
        }
    }

    func buildWindow() {
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 980, height: 790),
            styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "星光播放器 · 电脑版视频原型"
        window.minSize = NSSize(width: 760, height: 650)
        window.backgroundColor = NSColor(white: 242/255, alpha: 1)
        window.delegate = self; window.isReleasedWhenClosed = false
        let title = NSTextField(labelWithString: "星光播放器")
        title.font = .systemFont(ofSize: 26, weight: .medium)
        let subtitle = NSTextField(labelWithString: "电脑版视频原型 · 49遍完整流程")
        subtitle.textColor = .secondaryLabelColor
        image.imageScaling = .scaleProportionallyUpOrDown
        image.wantsLayer = true; image.layer?.backgroundColor = NSColor.black.cgColor
        image.layer?.cornerRadius = 10; image.layer?.masksToBounds = true
        status.font = .monospacedDigitSystemFont(ofSize: 20, weight: .medium)
        timing.font = .monospacedDigitSystemFont(ofSize: 13, weight: .regular)
        timing.textColor = .secondaryLabelColor
        progress.isIndeterminate = false; progress.minValue = 0; progress.maxValue = clock.total
        let specs: [(String, Selector)] = [
            ("从流程开头", #selector(fromStart)), ("模拟迟到10分钟", #selector(joinLate)),
            ("暂停", #selector(pause)), ("追上当前进度", #selector(resume)), ("停止", #selector(stop))
        ]
        buttons = specs.map { title, selector in
            let button = NSButton(title: title, target: self, action: selector)
            button.bezelStyle = .rounded; button.contentTintColor = accent
            button.isEnabled = false
            return button
        }
        let row = NSStackView(views: buttons)
        row.orientation = .horizontal; row.distribution = .fillEqually; row.spacing = 10
        let info = NSTextField(wrappingLabelWithString:
            "片头 → 正文48遍 → 特殊末遍 → 片尾\n流程遍次不是本机已完成遍数；以界面的流程遍次为准。\n独立验证窗口，不修改正式版数据。暂停后点击“追上当前进度”恢复同步。")
        info.font = .systemFont(ofSize: 12); info.textColor = .secondaryLabelColor
        let stack = NSStackView(views: [title, subtitle, image, status, timing, progress, row, info])
        stack.orientation = .vertical; stack.alignment = .leading; stack.spacing = 12
        stack.translatesAutoresizingMaskIntoConstraints = false
        window.contentView!.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: window.contentView!.leadingAnchor, constant: 28),
            stack.trailingAnchor.constraint(equalTo: window.contentView!.trailingAnchor, constant: -28),
            stack.topAnchor.constraint(equalTo: window.contentView!.topAnchor, constant: 20),
            stack.bottomAnchor.constraint(lessThanOrEqualTo: window.contentView!.bottomAnchor, constant: -20),
            image.widthAnchor.constraint(equalTo: stack.widthAnchor),
            image.heightAnchor.constraint(equalTo: image.widthAnchor, multiplier: 9/16),
            progress.widthAnchor.constraint(equalTo: stack.widthAnchor),
            row.widthAnchor.constraint(equalTo: stack.widthAnchor),
            row.heightAnchor.constraint(equalToConstant: 36)
        ])
        let menu = NSMenu()
        let appMenu = NSMenu(); appMenu.addItem(withTitle: "退出视频原型", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        let item = NSMenuItem(); item.submenu = appMenu; menu.addItem(item); NSApp.mainMenu = menu
        window.center()
        // Automated rendering does not need focus or a visible window. Avoid
        // stealing the user's keyboard while the boundary suite is running.
        if suite == "manual" {
            window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true)
        }
    }

    func fail(_ message: String) {
        guard state != "error" else { return }
        errors += 1; generation += 1; preparation = nil; replies.removeAll()
        state = "error"; status.stringValue = "验证错误：\(message)"
        evidence.log("error", ["message": message])
        if engine != nil {
            sequence += 1
            _ = video_command(engine, sequence, "set", "pause", "yes")
        }
    }
    func command(_ a: String, _ b: String, _ c: String, after: (() -> Void)? = nil) {
        sequence += 1
        let id = sequence
        if let after = after { replies[id] = (generation, after) }
        let result = video_command(engine, id, a, b, c)
        evidence.log("command", ["id": id, "args": [a,b,c], "generation": generation])
        if result < 0 { replies.removeValue(forKey: id); fail(String(cString: video_error(result))) }
    }
    func pollEvents() {
        for _ in 0..<200 {
            var event = video_poll(engine)
            if event.id == 0 { break }
            var row: [String: Any] = ["id": event.id, "error": event.error,
                "request": event.request, "reason": event.reason]
            if event.id == 2 {
                row["message"] = withUnsafePointer(to: &event.message) {
                    $0.withMemoryRebound(to: CChar.self, capacity: 768) { String(cString: $0) }
                }
            }
            evidence.log("native-event", row)
            if event.id == 5 {
                let handler = replies.removeValue(forKey: event.request)
                if event.error < 0 { fail(String(cString: video_error(event.error))) }
                else if let handler = handler, handler.0 == generation { handler.1() }
            } else if event.id == 8 {
                let duration = video_number(engine, "duration")
                guard duration.isFinite, abs(duration - clock.total) < 0.002 else {
                    fail("引擎与公共时间轴的总时长不一致"); continue
                }
                ready = true; state = "stopped"
                status.stringValue = "已就绪 · 点击“从流程开头”开始"
                evidence.log("ready", ["duration": duration])
                buttons.forEach { $0.isEnabled = suite == "manual" }
            } else if event.id == 21 {
                restarts += 1
            } else if event.id == 7 && event.error < 0 {
                fail("引擎播放失败 \(event.error)")
            } else if event.id == 1 || event.id == 24 {
                fail("引擎退出或事件队列溢出")
            }
        }
    }

    func begin(_ offset: Double) {
        guard ready, offset.isFinite else { return }
        anchor = wall() - offset * 1000
        evidence.log("new-occurrence", ["anchor": anchor!, "offset": offset])
        align()
    }
    func align() {
        guard ready, let anchor = anchor else { return }
        generation += 1; replies.removeAll(); preparation = nil
        lastSpan = -1
        if clock.locate(anchor, wall())["status"] as? String == "ended" {
            state = "ended"; command("set", "pause", "yes")
            evidence.log("already-ended"); return
        }
        state = "preparing"
        command("set", "pause", "yes") { [weak self] in self?.prepareSeek(0) }
    }
    func prepareSeek(_ retry: Int) {
        guard let anchor = anchor else { return }
        let now = wall(), mono = host()
        // Keep a short remaining tail eligible to play instead of skipping it
        // merely because it is shorter than the ordinary preparation budget.
        let remainingMs = max(0, anchor + clock.total * 1000 - now)
        let launchWall = max(anchor, now + min(500, remainingMs / 2))
        let target = max(0, (launchWall - anchor) / 1000)
        if target >= clock.total {
            state = "ended"; preparation = nil
            evidence.log("already-ended"); return
        }
        preparation = Preparation(generation: generation, target: target,
            deadline: mono + (launchWall - now) / 1000, started: mono, restart: restarts, retry: retry)
        evidence.log("prepare", ["target": target, "deadline": preparation!.deadline, "retry": retry])
        command("seek", String(format: "%.9f", target), "absolute+exact") { [weak self] in
            self?.preparation?.acknowledged = true
        }
    }
    func updatePreparation() {
        guard var p = preparation, p.generation == generation else { return }
        if host() - p.started > 8 { fail("精确定位超时"); return }
        let position = video_number(engine, "time-pos")
        if !p.ready && p.acknowledged && restarts > p.restart &&
            video_flag(engine, "seeking") == 0 && position.isFinite && abs(position - p.target) <= 0.12 {
            p.ready = true; preparation = p
            evidence.log("prepared", ["target": p.target, "position": position, "latencyMs": (host()-p.started)*1000])
        }
        if p.ready && host() >= p.deadline {
            // A late preparation must re-evaluate the shared clock, never play an old offset.
            if host() - p.deadline > 0.1 {
                if p.retry >= 3 { fail("无法在准备窗口内完成定位"); return }
                prepareSeek(p.retry + 1); return
            }
            preparation = nil
            command("set", "pause", "no") { [weak self] in
                guard let self = self else { return }
                self.state = "playing"
                self.evidence.log("released", ["target": p.target,
                    "deadlineErrorMs": (host() - p.deadline) * 1000])
            }
        }
    }
    @objc func fromStart() { begin(-1) }
    @objc func joinLate() { begin(600) }
    @objc func pause() {
        guard ready else { return }
        generation += 1; preparation = nil; replies.removeAll(); state = "paused"
        command("set", "pause", "yes"); evidence.log("pause")
    }
    @objc func resume() { align(); evidence.log("resume") }
    @objc func stop() {
        guard ready else { return }
        generation += 1; preparation = nil; replies.removeAll(); state = "stopped"
        // Retain the loaded native timeline. A subsequent explicit resume can catch up.
        command("set", "pause", "yes"); evidence.log("stop")
    }

    func drawFrame() {
        let serial = video_copy_frame(engine, &pixels, pixels.count, frames)
        guard serial != frames else { return }
        frames = serial
        let data = Data(pixels)
        guard let provider = CGDataProvider(data: data as CFData),
              let cg = CGImage(width: 864, height: 486, bitsPerComponent: 8, bitsPerPixel: 32,
                bytesPerRow: 864 * 4, space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.noneSkipLast.rawValue),
                provider: provider, decode: nil, shouldInterpolate: true, intent: .defaultIntent) else { return }
        image.image = NSImage(cgImage: cg, size: NSSize(width: 864, height: 486))
    }
    func tick() {
        guard engine != nil else { return }
        pollEvents(); drawFrame()
        let renderError = video_render_error(engine)
        if renderError < 0 { fail("视频渲染失败 \(renderError)") }
        if ready { updatePreparation(); advanceSuite() }
        guard host() - lastSample > 0.1 else { return }
        lastSample = host()
        let position = video_number(engine, "time-pos")
        let expected = anchor.map { (wall() - $0)/1000 } ?? 0
        let drift = position.isFinite ? (position-expected)*1000 : 0
        let location = clock.locate(0, max(0, position.isFinite ? position : 0) * 1000)
        let span = location["span"] as? [String: Any] ?? [:]
        let spanIndex = Int(number(span["index"]))
        if state == "playing" && spanIndex != lastSpan {
            evidence.log("span", ["index": spanIndex, "position": position, "frames": frames]); lastSpan = spanIndex
        }
        if state == "playing" && video_flag(engine, "eof-reached") == 1 {
            state = "ended"; evidence.log("ended", ["position": position])
        }
        if state != "error" {
            let phase = ["loading": "加载中", "preparing": "正在对齐", "playing": "同步播放",
                "paused": "已暂停", "stopped": "已停止", "ended": "流程已结束"][state] ?? state
            let role = span["role"] as? String ?? ""
            let chapter = role == "intro" ? "片头" : role == "outro" ? "片尾" :
                "流程第 \(Int(number(span["cycle"]))) / 49 遍"
            status.stringValue = "\(phase) · \(chapter)"
            let elapsed = position.isFinite ? position : 0
            progress.doubleValue = elapsed
            let driftText = state == "playing" ? String(format: "  ·  媒体时钟偏差 %+.0f ms", drift) : ""
            timing.stringValue = "\(formatTime(elapsed)) / \(formatTime(clock.total))\(driftText)"
        }
        var sample: [String: Any] = ["state": state, "expected": expected, "frames": frames,
            "paused": video_flag(engine, "pause"), "seeking": video_flag(engine, "seeking")]
        for property in ["time-pos", "audio-pts", "avsync", "frame-drop-count", "decoder-frame-drop-count"] {
            let value = video_number(engine, property)
            if value.isFinite { sample[property] = value }
        }
        evidence.log("sample", sample)
    }
    func formatTime(_ value: Double) -> String {
        let seconds = Int(max(0, value))
        return String(format: "%02d:%02d:%02d", seconds/3600, (seconds/60)%60, seconds%60)
    }

    func prepareScenarios() {
        guard suite != "manual" else { return }
        let indices = suite == "boundaries" ? Array(0..<clock.spans.count-1) : [0, 1, 48, 49]
        scenarios = indices.map { i in Scenario(name: "boundary-\(i)",
            offset: number(clock.spans[i]["endTicks"])/clock.scale - 1.7, seconds: 4.5) }
        scenarios += [
            Scenario(name: "future-start", offset: -1, seconds: 3.5),
            Scenario(name: "late-join", offset: 600, seconds: 3.5),
            Scenario(name: "pause-resume", offset: 640, seconds: 7, pauseAt: 1.5, resumeAt: 3),
            Scenario(name: "cancel-prepare", offset: 700, seconds: 2, pauseAt: 0.05),
            Scenario(name: "stop-prepare", offset: 800, seconds: 2, stopAt: 0.05),
            Scenario(name: "natural-end", offset: clock.total - 2.5, seconds: 4),
            Scenario(name: "already-ended", offset: clock.total + 1, seconds: 1.5),
        ]
    }
    func advanceSuite() {
        guard suite != "manual", !suiteFinished else { return }
        if scenarioIndex < 0 { nextScenario(); return }
        let s = scenarios[scenarioIndex], elapsed = host() - scenarioStart
        if let t = s.pauseAt, elapsed >= t && !pausedInScenario { pausedInScenario = true; pause() }
        if let t = s.resumeAt, elapsed >= t && !resumedInScenario { resumedInScenario = true; resume() }
        if let t = s.stopAt, elapsed >= t && !stoppedInScenario { stoppedInScenario = true; stop() }
        if elapsed >= s.seconds {
            evidence.log("scenario-complete")
            nextScenario()
        }
    }
    func nextScenario() {
        scenarioIndex += 1
        if scenarioIndex >= scenarios.count { finish(); return }
        let s = scenarios[scenarioIndex]
        scenarioStart = host(); pausedInScenario = false; resumedInScenario = false; stoppedInScenario = false
        evidence.scenario = s.name; evidence.log("scenario-start", ["offset": s.offset, "duration": s.seconds])
        begin(s.offset)
    }
    func finish() {
        guard !suiteFinished else { return }
        suiteFinished = true; stop(); evidence.complete(errors)
        if let tiff = image.image?.tiffRepresentation, let bitmap = NSBitmapImageRep(data: tiff),
           let png = bitmap.representation(using: .png, properties: [:]) {
            try? png.write(to: evidence.directory.appendingPathComponent("last-rendered-frame.png"))
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { NSApp.terminate(nil) }
    }
    func windowWillClose(_ notification: Notification) {
        evidence?.log("window-close")
        NSApp.terminate(nil)
    }
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        evidence?.log("terminate-request", ["suiteFinished": suiteFinished])
        return .terminateNow
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
    func applicationWillTerminate(_ notification: Notification) {
        timer?.invalidate(); timer = nil
        evidence?.log("closing")
        video_destroy(engine); engine = nil
    }
}

@main enum Main {
    static func main() {
        let app = NSApplication.shared
        let delegate = Preview()
        app.setActivationPolicy(delegate.suite == "manual" ? .regular : .accessory); app.delegate = delegate
        app.run()
        withExtendedLifetime(delegate) {}
    }
}
