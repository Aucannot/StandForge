import XCTest
@testable import StandForgeMac

final class StandForgeTimerModelTests: XCTestCase {
    private var defaults: UserDefaults!
    private var suiteName: String!

    override func setUp() {
        super.setUp()
        suiteName = "StandForgeMacTests-\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suiteName)
    }

    override func tearDown() {
        defaults.removePersistentDomain(forName: suiteName)
        defaults = nil
        suiteName = nil
        super.tearDown()
    }

    @MainActor
    func testTimerStatePersistsAcrossModelRecreation() {
        let model = StandForgeTimerModel(defaults: defaults)
        model.primaryAction()
        XCTAssertEqual(model.phase, .sitting)

        let restored = StandForgeTimerModel(defaults: defaults)
        XCTAssertEqual(restored.phase, .sitting)
        XCTAssertGreaterThan(restored.remainingSeconds, 0)
    }

    @MainActor
    func testSnoozeOnlyAppliesToPendingReminder() {
        let model = StandForgeTimerModel(defaults: defaults)
        model.snooze(minutes: 5)
        XCTAssertEqual(model.phase, .idle)

        model.phase = .standPending
        model.snooze(minutes: 5)
        XCTAssertEqual(model.phase, .snoozed)
        XCTAssertEqual(model.remainingSeconds, 300)
    }

    @MainActor
    func testStoppingStandingSessionCreatesHistory() async throws {
        let model = StandForgeTimerModel(defaults: defaults)
        model.phase = .standPending
        model.startStandingNow()
        try await Task.sleep(for: .milliseconds(1_100))
        model.stop()

        XCTAssertEqual(model.sessions.count, 1)
        XCTAssertGreaterThanOrEqual(model.sessions[0].durationSeconds, 1)
    }
}
