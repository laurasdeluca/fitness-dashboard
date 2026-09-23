import Foundation
import WidgetKit
import SwiftUI

struct FitnessEntry: TimelineEntry {
    let date: Date
    let snapshot: FitnessSnapshot
}

struct FitnessProvider: TimelineProvider {
    func placeholder(in context: Context) -> FitnessEntry {
        FitnessEntry(date: Date(), snapshot: FitnessSnapshot(
            load7d: 312, strain7d: 742, atl: 42.1, ctl: 51.3,
            sleep: "9h 05m", sleepDate: "Sep 20",
            hrv: 26, hrvDate: "Sep 20", restingHR: 72, restingHRDate: "Sep 20",
            fetchedAt: Date()
        ))
    }

    func getSnapshot(in context: Context, completion: @escaping (FitnessEntry) -> Void) {
        Task {
            completion(FitnessEntry(date: Date(), snapshot: await FitnessAPI.fetchSnapshot()))
        }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<FitnessEntry>) -> Void) {
        Task {
            let snapshot = await FitnessAPI.fetchSnapshot()
            let entry = FitnessEntry(date: Date(), snapshot: snapshot)
            let next = Calendar.current.date(byAdding: .minute, value: 30, to: Date()) ?? Date(timeIntervalSinceNow: 1800)
            completion(Timeline(entries: [entry], policy: .after(next)))
        }
    }
}

struct FitnessWidgetView: View {
    let entry: FitnessEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("LAUR'S FITNESS")
                    .font(.system(size: 11, weight: .bold, design: .rounded))
                    .tracking(1.2)
                Spacer()
                Image(systemName: "figure.run")
            }

            HStack(alignment: .firstTextBaseline, spacing: 5) {
                Text(entry.snapshot.load7d.map(String.init) ?? "—")
                    .font(.system(size: 31, weight: .bold, design: .rounded))
                Text("7-day load")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }

            HStack(spacing: 12) {
                metric("ATL", entry.snapshot.atl.map { String(format: "%.1f", $0) })
                metric("CTL", entry.snapshot.ctl.map { String(format: "%.1f", $0) })
                metric("HRV", entry.snapshot.hrv.map(String.init))
            }

            HStack(spacing: 12) {
                metric("SLEEP", entry.snapshot.sleep.map { value in
                    entry.snapshot.sleepDate.map { "(value) · ($0)" } ?? value
                })
                metric("RHR", entry.snapshot.restingHR.map(String.init))
            }

            Text("Updated \(entry.date.formatted(date: .omitted, time: .shortened))")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .containerBackground(.fill.tertiary, for: .widget)
        .widgetURL(URL(string: "https://laurs-fitness-tracker.vercel.app"))
    }

    @ViewBuilder
    private func metric(_ label: String, _ value: String?) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(value ?? "—")
                .font(.system(size: 15, weight: .semibold, design: .rounded))
            Text(label)
                .font(.system(size: 8, weight: .medium, design: .rounded))
                .foregroundStyle(.secondary)
        }
    }
}

struct LaurFitnessWidget: Widget {
    let kind = "LaurFitnessWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: FitnessProvider()) { entry in
            FitnessWidgetView(entry: entry)
        }
        .configurationDisplayName("Laur's Fitness Tracker")
        .description("Training and recovery at a glance.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

@main
struct LaurFitnessWidgetBundle: WidgetBundle {
    var body: some Widget {
        LaurFitnessWidget()
    }
}
