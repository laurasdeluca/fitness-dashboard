import SwiftUI

private let dashboardURL = URL(string: "https://laurs-fitness-tracker.vercel.app")!

@main
struct LaurFitnessTrackerApp: App {
    var body: some Scene {
        WindowGroup {
            VStack(spacing: 16) {
                Image(systemName: "figure.run.circle.fill")
                    .font(.system(size: 48))
                Text("Laur's Fitness Tracker")
                    .font(.title2.weight(.semibold))
                Text("Your full training dashboard is on the web. Add the widget for a quick glance.")
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
                Link("Open dashboard", destination: dashboardURL)
                    .buttonStyle(.borderedProminent)
            }
            .padding(32)
            .frame(minWidth: 320, minHeight: 260)
        }
    }
}
