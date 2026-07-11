import AppKit
import SwiftUI
import UserNotifications

private let compactWindowSize = NSSize(width: 340, height: 80)
private let expandedWindowSize = NSSize(width: 340, height: 520)

@main
enum StandForgeMacLauncher {
    static func main() {
        let app = NSApplication.shared
        let delegate = AppDelegate()
        app.delegate = delegate
        app.setActivationPolicy(.accessory)
        withExtendedLifetime(delegate) {
            app.run()
        }
    }
}

@MainActor
private final class AppDelegate: NSObject, NSApplicationDelegate, UNUserNotificationCenterDelegate {
    private let timerModel = StandForgeTimerModel()
    private var window: NSWindow?

    func applicationDidFinishLaunching(_ notification: Notification) {
        UNUserNotificationCenter.current().delegate = self
        if timerModel.notificationsEnabled {
            timerModel.requestNotificationPermission()
        }
        createFloatingWindow()
        timerModel.startIfNeeded()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        false
    }

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound])
    }

    private func createFloatingWindow() {
        let rootView = FloatingTimerWindow(model: timerModel) { [weak self] expanded in
            self?.resizeFloatingWindow(expanded: expanded)
        }

        let hostingController = NSHostingController(rootView: rootView)
        let window = NSWindow(
            contentRect: NSRect(origin: .zero, size: compactWindowSize),
            styleMask: [.borderless],
            backing: .buffered,
            defer: false
        )

        window.title = "StandForge"
        window.contentViewController = hostingController
        window.backgroundColor = .clear
        window.isOpaque = false
        window.hasShadow = false
        window.level = .floating
        window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
        window.isMovableByWindowBackground = true

        if let screen = NSScreen.main {
            let frame = screen.visibleFrame
            window.setFrameOrigin(NSPoint(x: frame.minX + 24, y: frame.maxY - compactWindowSize.height - 24))
        }

        window.orderFrontRegardless()
        self.window = window
    }

    private func resizeFloatingWindow(expanded: Bool) {
        guard let window else { return }
        let targetSize = expanded ? expandedWindowSize : compactWindowSize
        let currentFrame = window.frame
        let topLeft = NSPoint(x: currentFrame.minX, y: currentFrame.maxY)
        let nextFrame = NSRect(
            x: topLeft.x,
            y: topLeft.y - targetSize.height,
            width: targetSize.width,
            height: targetSize.height
        )
        window.setFrame(nextFrame, display: true, animate: true)
    }
}

enum TimerPhase: String, Codable {
    case idle
    case sitting
    case standPending
    case standing
    case snoozed
    case paused
}

struct NativeStandSession: Codable, Identifiable {
    let id: UUID
    let start: Date
    let end: Date
    let durationSeconds: Int
    let snoozeCount: Int
}

private struct PersistedTimerState: Codable {
    let phase: TimerPhase
    let deadline: Date?
    let remainingSeconds: Int
    let totalPhaseSeconds: Int
    let phaseBeforePause: TimerPhase
    let standStartedAt: Date?
    let snoozeCount: Int
}

@MainActor
final class StandForgeTimerModel: ObservableObject {
    @Published var phase: TimerPhase = .idle
    @Published var remainingSeconds: Int = 45 * 60
    @Published var totalPhaseSeconds: Int = 45 * 60
    @Published var sitMinutes: Double {
        didSet {
            defaults.set(sitMinutes, forKey: "sitMinutes")
            if phase == .idle {
                remainingSeconds = Int(sitMinutes * 60)
                totalPhaseSeconds = remainingSeconds
            }
        }
    }
    @Published var standMinutes: Double {
        didSet { defaults.set(standMinutes, forKey: "standMinutes") }
    }
    @Published var notificationsEnabled: Bool {
        didSet {
            defaults.set(notificationsEnabled, forKey: "notificationsEnabled")
            if notificationsEnabled {
                requestNotificationPermission()
            }
        }
    }
    @Published var soundEnabled: Bool {
        didSet { defaults.set(soundEnabled, forKey: "soundEnabled") }
    }
    @Published private(set) var sessions: [NativeStandSession]

    private let defaults: UserDefaults
    private var timer: Timer?
    private var phaseBeforePause: TimerPhase = .idle
    private var deadline: Date?
    private var standStartedAt: Date?
    private var snoozeCount = 0

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        sitMinutes = defaults.object(forKey: "sitMinutes") as? Double ?? 45
        standMinutes = defaults.object(forKey: "standMinutes") as? Double ?? 15
        notificationsEnabled = defaults.object(forKey: "notificationsEnabled") as? Bool ?? true
        soundEnabled = defaults.object(forKey: "soundEnabled") as? Bool ?? true
        sessions = Self.decodeSessions(from: defaults)

        if let data = defaults.data(forKey: "timerState"),
           let persisted = try? JSONDecoder().decode(PersistedTimerState.self, from: data) {
            phase = persisted.phase
            deadline = persisted.deadline
            totalPhaseSeconds = persisted.totalPhaseSeconds
            phaseBeforePause = persisted.phaseBeforePause
            standStartedAt = persisted.standStartedAt
            snoozeCount = persisted.snoozeCount
            if persisted.phase == .paused {
                remainingSeconds = persisted.remainingSeconds
            } else if let deadline = persisted.deadline {
                remainingSeconds = max(0, Int(ceil(deadline.timeIntervalSinceNow)))
            } else {
                remainingSeconds = persisted.remainingSeconds
            }
        } else {
            remainingSeconds = Int(sitMinutes * 60)
            totalPhaseSeconds = Int(sitMinutes * 60)
        }
    }

    var displaySeconds: Int {
        phase == .idle ? Int(sitMinutes * 60) : remainingSeconds
    }

    var phaseLabel: String {
        switch phase {
        case .idle:
            "后台提醒"
        case .sitting:
            "屏幕使用"
        case .standPending:
            "该站一会儿"
        case .standing:
            remainingSeconds <= 0 ? "可以坐下" : "站立中"
        case .snoozed:
            "已延后"
        case .paused:
            "已暂停"
        }
    }

    var primaryActionTitle: String {
        switch phase {
        case .idle:
            "启动"
        case .standPending:
            "我已站起"
        case .standing:
            "我已坐下"
        case .paused:
            "继续"
        default:
            "暂停"
        }
    }

    var primaryActionIcon: String {
        switch phase {
        case .idle, .paused:
            "play.fill"
        case .standPending:
            "checkmark"
        case .standing:
            "sofa.fill"
        default:
            "pause.fill"
        }
    }

    var todaySessions: [NativeStandSession] {
        sessions
            .filter { Calendar.current.isDateInToday($0.end) }
            .sorted { $0.end > $1.end }
    }

    var todayTotalDuration: Int {
        todaySessions.reduce(0) { $0 + $1.durationSeconds }
    }

    var todayCompletionRate: Int {
        guard !todaySessions.isEmpty else { return 0 }
        let target = max(1, Int(standMinutes * 60) * todaySessions.count)
        return min(100, todayTotalDuration * 100 / target)
    }

    func primaryAction() {
        switch phase {
        case .idle:
            startSitting()
        case .standPending:
            startStanding()
        case .standing:
            startSitting()
        case .paused:
            resume()
        default:
            pause()
        }
    }

    func startIfNeeded() {
        if phase == .idle {
            startSitting()
            return
        }
        if phase == .sitting || phase == .standing || phase == .snoozed {
            scheduleTimer(keepDeadline: true)
            tick()
        }
    }

    func stop() {
        completeStandingSessionIfNeeded()
        timer?.invalidate()
        timer = nil
        deadline = nil
        phase = .idle
        totalPhaseSeconds = Int(sitMinutes * 60)
        remainingSeconds = totalPhaseSeconds
        phaseBeforePause = .idle
        snoozeCount = 0
        persistState()
    }

    func snooze(minutes: Int) {
        guard phase == .standPending || phase == .snoozed else { return }
        phase = .snoozed
        totalPhaseSeconds = minutes * 60
        remainingSeconds = totalPhaseSeconds
        snoozeCount += 1
        scheduleTimer()
        persistState()
    }

    func startStandingNow() {
        startStanding()
    }

    func requestNotificationPermission() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }
    }

    private func startSitting() {
        completeStandingSessionIfNeeded()
        phase = .sitting
        totalPhaseSeconds = Int(sitMinutes * 60)
        remainingSeconds = totalPhaseSeconds
        snoozeCount = 0
        scheduleTimer()
        persistState()
    }

    private func startStanding() {
        phase = .standing
        totalPhaseSeconds = Int(standMinutes * 60)
        remainingSeconds = totalPhaseSeconds
        standStartedAt = Date()
        scheduleTimer()
        persistState()
    }

    private func pause() {
        guard phase != .idle, phase != .paused else { return }
        phaseBeforePause = phase
        phase = .paused
        deadline = nil
        timer?.invalidate()
        timer = nil
        persistState()
    }

    private func resume() {
        phase = phaseBeforePause == .idle ? .sitting : phaseBeforePause
        scheduleTimer()
        persistState()
    }

    private func scheduleTimer(keepDeadline: Bool = false) {
        timer?.invalidate()
        if !keepDeadline || deadline == nil {
            deadline = Date().addingTimeInterval(TimeInterval(remainingSeconds))
        }
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.tick()
            }
        }
    }

    private func tick() {
        guard phase == .sitting || phase == .standing || phase == .snoozed else { return }
        guard let deadline else { return }
        remainingSeconds = max(0, Int(ceil(deadline.timeIntervalSinceNow)))

        guard remainingSeconds == 0 else { return }

        timer?.invalidate()
        timer = nil
        self.deadline = nil

        switch phase {
        case .sitting:
            phase = .standPending
            notify(title: "站立提醒", subtitle: "屏幕使用时间已到", body: "起来活动一下。")
        case .standing:
            notify(title: "坐下提醒", subtitle: "本轮站立完成", body: "可以回到屏幕前。")
        case .snoozed:
            phase = .standPending
            notify(title: "站立提醒", subtitle: "延后时间到了", body: "现在起来活动一下。")
        default:
            break
        }
        persistState()
    }

    private func completeStandingSessionIfNeeded() {
        guard let standStartedAt else { return }
        let end = Date()
        let duration = max(0, Int(end.timeIntervalSince(standStartedAt)))
        if duration > 0 {
            sessions.append(
                NativeStandSession(
                    id: UUID(),
                    start: standStartedAt,
                    end: end,
                    durationSeconds: duration,
                    snoozeCount: snoozeCount
                )
            )
            sessions = Array(sessions.suffix(500))
            persistSessions()
        }
        self.standStartedAt = nil
    }

    private func persistState() {
        let state = PersistedTimerState(
            phase: phase,
            deadline: deadline,
            remainingSeconds: remainingSeconds,
            totalPhaseSeconds: totalPhaseSeconds,
            phaseBeforePause: phaseBeforePause,
            standStartedAt: standStartedAt,
            snoozeCount: snoozeCount
        )
        if let data = try? JSONEncoder().encode(state) {
            defaults.set(data, forKey: "timerState")
        }
    }

    private func persistSessions() {
        if let data = try? JSONEncoder().encode(sessions) {
            defaults.set(data, forKey: "sessions")
        }
    }

    private static func decodeSessions(from defaults: UserDefaults) -> [NativeStandSession] {
        guard let data = defaults.data(forKey: "sessions") else { return [] }
        return (try? JSONDecoder().decode([NativeStandSession].self, from: data)) ?? []
    }

    private func notify(title: String, subtitle: String, body: String) {
        guard notificationsEnabled else { return }
        let content = UNMutableNotificationContent()
        content.title = title
        content.subtitle = subtitle
        content.body = body
        if soundEnabled {
            content.sound = .default
        }

        let request = UNNotificationRequest(
            identifier: "standforge-\(UUID().uuidString)",
            content: content,
            trigger: nil
        )
        UNUserNotificationCenter.current().add(request)
    }
}

private enum FloatingTab: String, CaseIterable, Identifiable {
    case reminder = "提醒"
    case settings = "设置"
    case today = "今日"

    var id: String { rawValue }

    var systemImage: String {
        switch self {
        case .reminder:
            "timer"
        case .settings:
            "slider.horizontal.3"
        case .today:
            "chart.bar"
        }
    }
}

private struct FloatingTimerWindow: View {
    @ObservedObject var model: StandForgeTimerModel
    let onExpansionChange: (Bool) -> Void

    @State private var isExpanded = false
    @State private var selectedTab: FloatingTab = .reminder

    var body: some View {
        StandForgeGlassContainer {
            VStack(spacing: isExpanded ? 12 : 0) {
                header
                    .frame(height: 58)

                if isExpanded {
                    expandedPanel
                }
            }
            .padding(isExpanded ? 10 : 11)
            .frame(width: 340, height: isExpanded ? 520 : 80)
            .standForgeGlass(
                RoundedRectangle(cornerRadius: isExpanded ? 20 : 18, style: .continuous),
                interactive: false
            )
            .animation(.smooth(duration: 0.24), value: isExpanded)
            .onChange(of: isExpanded) { _, value in
                onExpansionChange(value)
            }
        }
    }

    private var header: some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text("StandForge")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(.secondary)

                Text(formatTime(model.displaySeconds))
                    .font(.system(size: 34, weight: .bold, design: .rounded).monospacedDigit())
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.82)
            }

            Spacer(minLength: 8)

            VStack(alignment: .trailing, spacing: 6) {
                Text(model.phaseLabel)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)

                HStack(spacing: 8) {
                    glassIconButton(
                        systemName: isExpanded ? "chevron.down" : "slider.horizontal.3",
                        accessibilityLabel: isExpanded ? "收起设置" : "展开设置"
                    ) {
                        isExpanded.toggle()
                    }

                    glassIconButton(
                        systemName: model.primaryActionIcon,
                        accessibilityLabel: model.primaryActionTitle,
                        prominent: true
                    ) {
                        model.primaryAction()
                    }
                }
            }
        }
    }

    private var expandedPanel: some View {
        VStack(spacing: 12) {
            Picker("视图", selection: $selectedTab) {
                ForEach(FloatingTab.allCases) { tab in
                    Label(tab.rawValue, systemImage: tab.systemImage).tag(tab)
                }
            }
            .labelsHidden()
            .pickerStyle(.segmented)
            .standForgeGlass(RoundedRectangle(cornerRadius: 18, style: .continuous), interactive: true)

            Group {
                switch selectedTab {
                case .reminder:
                    reminderContent
                case .settings:
                    settingsContent
                case .today:
                    todayContent
                }
            }
            .frame(maxHeight: .infinity, alignment: .top)
        }
    }

    private var reminderContent: some View {
        VStack(spacing: 12) {
            glassPanel {
                HStack(spacing: 12) {
                    Image(systemName: "circle.dotted")
                        .foregroundStyle(.teal)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(model.phaseLabel)
                            .font(.system(size: 15, weight: .semibold))
                        Text("屏幕 \(Int(model.sitMinutes)) 分 / 站立 \(Int(model.standMinutes)) 分")
                            .font(.system(size: 12))
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                }
            }

            glassTextButton(title: model.primaryActionTitle, systemName: model.primaryActionIcon, prominent: true) {
                model.primaryAction()
            }

            if model.phase == .standPending {
                HStack(spacing: 8) {
                    ForEach([5, 10, 15], id: \.self) { minutes in
                        glassTextButton(title: "+\(minutes) 分钟") {
                            model.snooze(minutes: minutes)
                        }
                    }
                }
            }

            HStack(spacing: 8) {
                glassTextButton(title: "结束", systemName: "stop.fill") {
                    model.stop()
                }
                if model.phase == .sitting || model.phase == .standPending || model.phase == .snoozed {
                    glassTextButton(title: "现在站立", systemName: "figure.stand") {
                        model.startStandingNow()
                    }
                }
            }
        }
    }

    private var settingsContent: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 12) {
                glassPanel {
                    Toggle(isOn: $model.notificationsEnabled) {
                        Label {
                            VStack(alignment: .leading, spacing: 3) {
                                Text("系统通知")
                                    .font(.system(size: 15, weight: .semibold))
                                Text("站立提醒和坐下提醒")
                                    .font(.system(size: 12))
                                    .foregroundStyle(.secondary)
                            }
                        } icon: {
                            Image(systemName: "bell")
                                .foregroundStyle(.teal)
                        }
                    }
                    .toggleStyle(.switch)
                }

                glassPanel {
                    Toggle(isOn: $model.soundEnabled) {
                        Label {
                            VStack(alignment: .leading, spacing: 3) {
                                Text("提醒声音")
                                    .font(.system(size: 15, weight: .semibold))
                                Text("通知到达时播放提示音")
                                    .font(.system(size: 12))
                                    .foregroundStyle(.secondary)
                            }
                        } icon: {
                            Image(systemName: "speaker.wave.2")
                                .foregroundStyle(.teal)
                        }
                    }
                    .toggleStyle(.switch)
                }

                sliderPanel(title: "屏幕使用", value: $model.sitMinutes, range: 5...90, step: 5)
                sliderPanel(title: "站立", value: $model.standMinutes, range: 3...30, step: 1)

                glassTextButton(title: "退出 StandForge", systemName: "power") {
                    NSApplication.shared.terminate(nil)
                }
            }
            .padding(.bottom, 4)
        }
    }

    private var todayContent: some View {
        VStack(spacing: 12) {
            HStack(spacing: 8) {
                statPanel(title: "站立总时长", value: formatDuration(model.todayTotalDuration))
                statPanel(title: "完成次数", value: "\(model.todaySessions.count)")
                statPanel(title: "完成率", value: "\(model.todayCompletionRate)%")
            }

            glassPanel {
                if model.todaySessions.isEmpty {
                    VStack(spacing: 4) {
                        Text("今天还没有完成记录")
                            .font(.system(size: 14, weight: .semibold))
                        Text("完成一次站立后会出现在这里。")
                            .font(.system(size: 12))
                            .foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity)
                } else {
                    VStack(spacing: 0) {
                        ForEach(Array(model.todaySessions.prefix(4))) { session in
                            HStack {
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(session.start.formatted(date: .omitted, time: .shortened))
                                        .font(.system(size: 13, weight: .semibold).monospacedDigit())
                                    Text("延后 \(session.snoozeCount) 次")
                                        .font(.system(size: 11))
                                        .foregroundStyle(.secondary)
                                }
                                Spacer()
                                Text(formatDuration(session.durationSeconds))
                                    .font(.system(size: 13, weight: .bold).monospacedDigit())
                            }
                            .padding(.vertical, 8)
                        }
                    }
                }
            }
        }
    }

    private func sliderPanel(
        title: String,
        value: Binding<Double>,
        range: ClosedRange<Double>,
        step: Double
    ) -> some View {
        glassPanel {
            VStack(spacing: 10) {
                HStack {
                    Text(title)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(.secondary)
                    Spacer()
                    Text("\(Int(value.wrappedValue)) 分钟")
                        .font(.system(size: 15, weight: .bold).monospacedDigit())
                }
                Slider(value: value, in: range, step: step)
                    .tint(.teal)
            }
        }
    }

    private func statPanel(title: String, value: String) -> some View {
        glassPanel {
            VStack(alignment: .leading, spacing: 8) {
                Text(title)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.72)
                Text(value)
                    .font(.system(size: 18, weight: .bold).monospacedDigit())
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func glassPanel<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        content()
            .padding(14)
            .frame(maxWidth: .infinity)
            .standForgeGlass(RoundedRectangle(cornerRadius: 20, style: .continuous), interactive: true)
    }

    private func glassIconButton(
        systemName: String,
        accessibilityLabel: String,
        prominent: Bool = false,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(prominent ? .white : .primary)
                .frame(width: 36, height: 36)
                .contentShape(Circle())
                .standForgeGlass(Circle(), interactive: true, tint: prominent ? .teal : nil)
        }
        .accessibilityLabel(accessibilityLabel)
        .buttonStyle(.plain)
    }

    private func glassTextButton(
        title: String,
        systemName: String? = nil,
        prominent: Bool = false,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 6) {
                if let systemName {
                    Image(systemName: systemName)
                }
                Text(title)
                    .font(.system(size: 13, weight: .semibold))
            }
            .frame(maxWidth: .infinity, minHeight: 36)
            .contentShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .standForgeGlass(
                RoundedRectangle(cornerRadius: 18, style: .continuous),
                interactive: true,
                tint: prominent ? .teal : nil
            )
        }
        .buttonStyle(.plain)
    }

    private func formatTime(_ seconds: Int) -> String {
        let safeSeconds = max(0, seconds)
        return String(format: "%02d:%02d", safeSeconds / 60, safeSeconds % 60)
    }

    private func formatDuration(_ seconds: Int) -> String {
        let minutes = seconds / 60
        if minutes > 0 {
            return "\(minutes) 分"
        }
        return "\(seconds) 秒"
    }
}

private struct StandForgeGlassContainer<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        if #available(macOS 26.0, *) {
            GlassEffectContainer(spacing: 12) {
                content
            }
        } else {
            content
        }
    }
}

private extension View {
    @ViewBuilder
    func standForgeGlass<S: Shape>(_ shape: S, interactive: Bool, tint: Color? = nil) -> some View {
        if #available(macOS 26.0, *) {
            if let tint {
                self.glassEffect(
                    interactive ? .regular.tint(tint).interactive() : .regular.tint(tint),
                    in: shape
                )
            } else {
                self.glassEffect(interactive ? .regular.interactive() : .regular, in: shape)
            }
        } else {
            self
                .background(.ultraThinMaterial, in: shape)
                .overlay {
                    shape.stroke(.white.opacity(0.28), lineWidth: 1)
                }
        }
    }
}
