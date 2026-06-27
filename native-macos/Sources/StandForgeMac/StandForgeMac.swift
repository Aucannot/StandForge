import AppKit
import SwiftUI
import UserNotifications

private let compactWindowSize = NSSize(width: 340, height: 80)
private let minimumCompactWindowSize = NSSize(width: 260, height: 40)
private let expandedWindowSize = NSSize(width: 340, height: 520)

private func formatTime(_ seconds: Int) -> String {
    let safeSeconds = max(0, seconds)
    return String(format: "%02d:%02d", safeSeconds / 60, safeSeconds % 60)
}

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
    private var statusItem: NSStatusItem?
    private var statusMenu: NSMenu?
    private var showWindowMenuItem: NSMenuItem?
    private var hideWindowMenuItem: NSMenuItem?
    private var notificationsMenuItem: NSMenuItem?
    private var soundMenuItem: NSMenuItem?
    private var statusRefreshTimer: Timer?

    func applicationDidFinishLaunching(_ notification: Notification) {
        UNUserNotificationCenter.current().delegate = self
        timerModel.requestNotificationPermission()
        createStatusItem()
        createFloatingWindow()
        timerModel.startIfNeeded()
        updateStatusItem()
        statusRefreshTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.updateStatusItem()
            }
        }
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
        let rootView = FloatingTimerWindow(
            model: timerModel,
            onExpansionChange: { [weak self] expanded in
                self?.resizeFloatingWindow(expanded: expanded)
            },
            onHide: { [weak self] in
                self?.hideFloatingWindow()
            },
            onQuit: {
                NSApplication.shared.terminate(nil)
            }
        )

        let hostingController = NSHostingController(rootView: rootView)
        let window = NSWindow(
            contentRect: NSRect(origin: .zero, size: compactWindowSize),
            styleMask: [.borderless, .resizable],
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
        window.minSize = minimumCompactWindowSize

        if let screen = NSScreen.main {
            let frame = screen.visibleFrame
            window.setFrameOrigin(NSPoint(x: frame.minX + 24, y: frame.maxY - compactWindowSize.height - 24))
        }

        window.orderFrontRegardless()
        self.window = window
    }

    private func createStatusItem() {
        let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        statusItem.button?.image = StandForgeStatusIcon.makeImage()
        statusItem.button?.imagePosition = .imageLeading
        statusItem.button?.font = .monospacedDigitSystemFont(ofSize: 12, weight: .semibold)

        let menu = NSMenu()
        let showItem = statusMenuItem(title: "显示悬浮窗", action: #selector(showFloatingWindow))
        let hideItem = statusMenuItem(title: "隐藏悬浮窗", action: #selector(hideFloatingWindow))
        menu.addItem(showItem)
        menu.addItem(hideItem)
        menu.addItem(.separator())
        let notificationsItem = statusMenuItem(title: "系统通知", action: #selector(toggleNotificationsFromMenu))
        let soundItem = statusMenuItem(title: "提醒声音", action: #selector(toggleSoundFromMenu))
        menu.addItem(notificationsItem)
        menu.addItem(soundItem)
        menu.addItem(.separator())
        menu.addItem(statusMenuItem(title: "暂停", action: #selector(togglePauseFromMenu)))
        menu.addItem(statusMenuItem(title: "结束本轮", action: #selector(stopFromMenu)))
        menu.addItem(.separator())
        menu.addItem(statusMenuItem(title: "退出 StandForge", action: #selector(quitFromMenu), keyEquivalent: "q"))

        statusItem.menu = menu
        self.statusItem = statusItem
        self.statusMenu = menu
        self.showWindowMenuItem = showItem
        self.hideWindowMenuItem = hideItem
        self.notificationsMenuItem = notificationsItem
        self.soundMenuItem = soundItem
    }

    private func statusMenuItem(title: String, action: Selector, keyEquivalent: String = "") -> NSMenuItem {
        let item = NSMenuItem(title: title, action: action, keyEquivalent: keyEquivalent)
        item.target = self
        return item
    }

    private func updateStatusItem() {
        statusItem?.button?.title = " \(formatTime(timerModel.displaySeconds))"
        statusItem?.button?.toolTip = "\(timerModel.phaseLabel) · \(formatTime(timerModel.displaySeconds))"

        guard let statusMenu else { return }
        let isWindowVisible = window?.isVisible == true
        showWindowMenuItem?.state = isWindowVisible ? .on : .off
        hideWindowMenuItem?.state = isWindowVisible ? .off : .on
        statusMenu.item(at: 0)?.isEnabled = true
        statusMenu.item(at: 1)?.isEnabled = isWindowVisible
        notificationsMenuItem?.state = timerModel.notificationsEnabled ? .on : .off
        soundMenuItem?.state = timerModel.soundEnabled ? .on : .off
        statusMenu.item(at: 6)?.title = timerModel.phase == .paused ? "继续" : "暂停"
    }

    @objc private func showFloatingWindow() {
        guard let window else { return }
        keepWindowVisible(window)
        NSApplication.shared.activate(ignoringOtherApps: true)
        window.makeKeyAndOrderFront(nil)
        window.orderFrontRegardless()
        updateStatusItem()
    }

    @objc private func hideFloatingWindow() {
        window?.orderOut(nil)
        updateStatusItem()
    }

    @objc private func togglePauseFromMenu() {
        timerModel.togglePause()
        updateStatusItem()
    }

    @objc private func toggleNotificationsFromMenu() {
        timerModel.notificationsEnabled.toggle()
        if timerModel.notificationsEnabled {
            timerModel.requestNotificationPermission()
        }
        updateStatusItem()
    }

    @objc private func toggleSoundFromMenu() {
        timerModel.soundEnabled.toggle()
        updateStatusItem()
    }

    @objc private func stopFromMenu() {
        timerModel.stop()
        updateStatusItem()
    }

    @objc private func quitFromMenu() {
        NSApplication.shared.terminate(nil)
    }

    private func keepWindowVisible(_ window: NSWindow) {
        guard let screen = window.screen ?? NSScreen.main else { return }
        let visibleFrame = screen.visibleFrame
        var frame = window.frame

        if frame.width < minimumCompactWindowSize.width {
            frame.size.width = minimumCompactWindowSize.width
        }
        if frame.height < minimumCompactWindowSize.height {
            frame.size.height = minimumCompactWindowSize.height
        }

        if frame.maxX > visibleFrame.maxX {
            frame.origin.x = visibleFrame.maxX - frame.width - 12
        }
        if frame.minX < visibleFrame.minX {
            frame.origin.x = visibleFrame.minX + 12
        }
        if frame.maxY > visibleFrame.maxY {
            frame.origin.y = visibleFrame.maxY - frame.height - 12
        }
        if frame.minY < visibleFrame.minY {
            frame.origin.y = visibleFrame.minY + 12
        }

        window.setFrame(frame, display: true)
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

private enum StandForgeStatusIcon {
    static func makeImage() -> NSImage {
        let size = NSSize(width: 18, height: 18)
        let image = NSImage(size: size)
        image.lockFocus()
        NSColor.labelColor.setStroke()
        NSBezierPath(roundedRect: NSRect(x: 3, y: 3, width: 12, height: 12), xRadius: 3, yRadius: 3).stroke()
        let standPath = NSBezierPath()
        standPath.lineWidth = 2
        standPath.lineCapStyle = .round
        standPath.move(to: NSPoint(x: 7, y: 5))
        standPath.line(to: NSPoint(x: 7, y: 13))
        standPath.move(to: NSPoint(x: 11, y: 5))
        standPath.line(to: NSPoint(x: 11, y: 13))
        standPath.stroke()
        image.unlockFocus()
        image.isTemplate = true
        return image
    }
}

private enum TimerPhase: Equatable {
    case idle
    case sitting
    case standPending
    case standing
    case snoozed
    case paused
}

@MainActor
private final class StandForgeTimerModel: ObservableObject {
    @Published var phase: TimerPhase = .idle
    @Published var remainingSeconds: Int = 45 * 60
    @Published var totalPhaseSeconds: Int = 45 * 60
    @Published var sitMinutes: Double {
        didSet { defaults.set(sitMinutes, forKey: "sitMinutes") }
    }
    @Published var standMinutes: Double {
        didSet { defaults.set(standMinutes, forKey: "standMinutes") }
    }
    @Published var notificationsEnabled: Bool {
        didSet { defaults.set(notificationsEnabled, forKey: "notificationsEnabled") }
    }
    @Published var soundEnabled: Bool {
        didSet { defaults.set(soundEnabled, forKey: "soundEnabled") }
    }

    private let defaults = UserDefaults.standard
    private var timer: Timer?
    private var phaseBeforePause: TimerPhase = .idle

    init() {
        sitMinutes = defaults.object(forKey: "sitMinutes") as? Double ?? 45
        standMinutes = defaults.object(forKey: "standMinutes") as? Double ?? 15
        notificationsEnabled = defaults.object(forKey: "notificationsEnabled") as? Bool ?? true
        soundEnabled = defaults.object(forKey: "soundEnabled") as? Bool ?? true
        remainingSeconds = Int(sitMinutes * 60)
        totalPhaseSeconds = Int(sitMinutes * 60)
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

    func togglePause() {
        if phase == .paused {
            resume()
        } else {
            pause()
        }
    }

    func startIfNeeded() {
        guard phase == .idle else { return }
        startSitting()
    }

    func stop() {
        timer?.invalidate()
        timer = nil
        phase = .idle
        totalPhaseSeconds = Int(sitMinutes * 60)
        remainingSeconds = totalPhaseSeconds
    }

    func snooze(minutes: Int) {
        phase = .snoozed
        totalPhaseSeconds = minutes * 60
        remainingSeconds = totalPhaseSeconds
        scheduleTimer()
    }

    func startStandingNow() {
        startStanding()
    }

    func requestNotificationPermission() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }
    }

    private func startSitting() {
        phase = .sitting
        totalPhaseSeconds = Int(sitMinutes * 60)
        remainingSeconds = totalPhaseSeconds
        scheduleTimer()
    }

    private func startStanding() {
        phase = .standing
        totalPhaseSeconds = Int(standMinutes * 60)
        remainingSeconds = totalPhaseSeconds
        scheduleTimer()
    }

    private func pause() {
        guard phase != .idle, phase != .paused else { return }
        phaseBeforePause = phase
        phase = .paused
        timer?.invalidate()
        timer = nil
    }

    private func resume() {
        phase = phaseBeforePause == .idle ? .sitting : phaseBeforePause
        scheduleTimer()
    }

    private func scheduleTimer() {
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.tick()
            }
        }
    }

    private func tick() {
        guard phase == .sitting || phase == .standing || phase == .snoozed else { return }
        remainingSeconds = max(0, remainingSeconds - 1)

        guard remainingSeconds == 0 else { return }

        timer?.invalidate()
        timer = nil

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
    let onHide: () -> Void
    let onQuit: () -> Void

    @State private var isExpanded = false
    @State private var selectedTab: FloatingTab = .reminder

    var body: some View {
        GeometryReader { proxy in
            let compactProgress = max(0, min(1, (proxy.size.height - minimumCompactWindowSize.height) / 40))
            let headerHeight = isExpanded ? 58 : max(34, proxy.size.height - 22)
            let timeSize = isExpanded ? 34 : 22 + (12 * compactProgress)
            let titleOpacity = isExpanded ? 1 : compactProgress
            let horizontalPadding = isExpanded ? 10 : 8 + (3 * compactProgress)

            StandForgeGlassContainer {
                VStack(spacing: isExpanded ? 12 : 0) {
                    header(
                        availableWidth: proxy.size.width - (horizontalPadding * 2),
                        timeSize: timeSize,
                        titleOpacity: titleOpacity,
                        compactProgress: compactProgress
                    )
                        .frame(height: headerHeight)

                    if isExpanded {
                        expandedPanel
                    }
                }
                .padding(.vertical, isExpanded ? 10 : 3 + (8 * compactProgress))
                .padding(.horizontal, horizontalPadding)
                .frame(
                    minWidth: minimumCompactWindowSize.width,
                    maxWidth: .infinity,
                    minHeight: isExpanded ? 420 : minimumCompactWindowSize.height,
                    maxHeight: .infinity
                )
                .standForgeGlass(
                    RoundedRectangle(cornerRadius: isExpanded ? 20 : 16 + (2 * compactProgress), style: .continuous),
                    interactive: false
                )
                .animation(.smooth(duration: 0.24), value: isExpanded)
                .onChange(of: isExpanded) { _, value in
                    onExpansionChange(value)
                }
            }
        }
    }

    private func header(
        availableWidth: Double,
        timeSize: Double,
        titleOpacity: Double,
        compactProgress: Double
    ) -> some View {
        let widthProgress = max(0, min(1, (availableWidth - 244) / 92))
        let buttonSize = 24 + (4 * min(compactProgress, widthProgress))
        let iconSize = 11.5 + (1.5 * min(compactProgress, widthProgress))
        let controlSpacing = 4 + (4 * widthProgress)
        let showSecondaryControls = widthProgress > 0.2
        let labelText = availableWidth < 284 ? model.phaseLabel.replacingOccurrences(of: "使用", with: "") : model.phaseLabel
        let statusWidth = max(44, min(78, availableWidth * 0.24))

        return HStack(alignment: .center, spacing: 6 + (6 * widthProgress)) {
            VStack(alignment: .leading, spacing: 2) {
                Text("StandForge")
                    .font(.system(size: 11 + (2 * titleOpacity), weight: .medium))
                    .foregroundStyle(.secondary)
                    .opacity(titleOpacity * widthProgress)
                    .frame(height: titleOpacity * widthProgress > 0.18 ? nil : 0)

                Text(formatTime(model.displaySeconds))
                    .font(.system(size: timeSize, weight: .bold, design: .rounded).monospacedDigit())
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.68)
            }
            .frame(minWidth: 82, alignment: .leading)
            .layoutPriority(2)

            Spacer(minLength: 0)

            Text(labelText)
                .font(.system(size: 10.5 + (2 * min(compactProgress, widthProgress)), weight: .semibold))
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .minimumScaleFactor(0.72)
                .frame(width: statusWidth, alignment: .trailing)
                .offset(x: showSecondaryControls ? 0 : -4)
                .layoutPriority(1)

            HStack(spacing: controlSpacing) {
                if showSecondaryControls {
                    glassIconButton(
                        systemName: "eye.slash",
                        accessibilityLabel: "隐藏悬浮窗",
                        size: buttonSize,
                        iconSize: iconSize
                    ) {
                        onHide()
                    }
                    .transition(.opacity.combined(with: .scale(scale: 0.92)))

                    glassIconButton(
                        systemName: isExpanded ? "chevron.down" : "slider.horizontal.3",
                        accessibilityLabel: isExpanded ? "收起设置" : "展开设置",
                        size: buttonSize,
                        iconSize: iconSize
                    ) {
                        isExpanded.toggle()
                    }
                    .transition(.opacity.combined(with: .scale(scale: 0.92)))
                }

                glassIconButton(
                    systemName: model.primaryActionIcon,
                    accessibilityLabel: model.primaryActionTitle,
                    prominent: true,
                    size: buttonSize,
                    iconSize: iconSize
                ) {
                    model.primaryAction()
                }
            }
            .layoutPriority(3)
            .animation(.smooth(duration: 0.18), value: showSecondaryControls)
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

                HStack(spacing: 8) {
                    glassTextButton(title: "隐藏悬浮窗", systemName: "eye.slash") {
                        onHide()
                    }
                    glassTextButton(title: "退出", systemName: "power") {
                        onQuit()
                    }
                }
            }
            .padding(.bottom, 4)
        }
    }

    private var todayContent: some View {
        VStack(spacing: 12) {
            HStack(spacing: 8) {
                statPanel(title: "站立总时长", value: "0 分")
                statPanel(title: "完成次数", value: "0")
                statPanel(title: "完成率", value: "0%")
            }

            glassPanel {
                VStack(spacing: 4) {
                    Text("今天还没有完成记录")
                        .font(.system(size: 14, weight: .semibold))
                    Text("原生版本先提供 Liquid Glass 浮窗和提醒流程。")
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity)
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
        size: Double = 28,
        iconSize: Double = 13,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: iconSize, weight: .semibold))
                .foregroundStyle(prominent ? .white : .primary)
                .frame(width: size, height: size)
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
