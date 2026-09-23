import Foundation

struct FitnessSnapshot: Sendable {
    let load7d: Int?
    let strain7d: Int?
    let atl: Double?
    let ctl: Double?
    let sleep: String?
    let sleepDate: String?
    let hrv: Int?
    let hrvDate: String?
    let restingHR: Int?
    let restingHRDate: String?
    let fetchedAt: Date
}

enum FitnessAPI {
    private static let baseURL = URL(string: "https://nyfgffkaewhjhnzdhiim.supabase.co/rest/v1")!
    private static let anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55ZmdmZmthZXdoamhuemRoaWltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3MzQxMzMsImV4cCI6MjEwNTMxMDEzM30.QaS22MNtmZxnGNVmM3qvCpUsgVOjPyWEnAgu8BslVyI"

    static func fetchSnapshot() async -> FitnessSnapshot {
        async let metrics = fetchMetrics()
        async let activities = fetchActivities()
        let m = await metrics
        let a = await activities

        let loads = lastSevenDailyLoads(from: a)
        let total = loads.reduce(0, +)
        let mean = Double(total) / 7.0
        let variance = loads.reduce(0.0) { $0 + pow(Double($1) - mean, 2) } / 7.0
        let sd = sqrt(variance)
        let monotony = sd > 0 ? mean / sd : 0
        let strain = total > 0 ? Int((Double(total) * monotony).rounded()) : nil

        return FitnessSnapshot(
            load7d: total > 0 ? total : nil,
            strain7d: strain,
            atl: m.first(where: { $0.atl != nil })?.atl,
            ctl: m.first(where: { $0.ctl != nil })?.ctl,
            sleep: FitnessAPI.formatSleep(m.first(where: { $0.sleep != nil })?.sleep),
            sleepDate: m.first(where: { $0.sleep != nil })?.date,
            hrv: m.first(where: { $0.hrv != nil })?.hrv.map { Int($0.rounded()) },
            hrvDate: m.first(where: { $0.hrv != nil })?.date,
            restingHR: m.first(where: { $0.rhr != nil })?.rhr.map { Int($0.rounded()) },
            restingHRDate: m.first(where: { $0.rhr != nil })?.date,
            fetchedAt: Date()
        )
    }

    private struct MetricRow {
        var date = ""
        var sleep: Double?
        var hrv: Double?
        var rhr: Double?
        var atl: Double?
        var ctl: Double?
    }

    private static func fetchMetrics() async -> [MetricRow] {
        var components = URLComponents(url: baseURL.appendingPathComponent("daily_metrics"), resolvingAgainstBaseURL: false)!
        components.queryItems = [
            URLQueryItem(name: "select", value: "metric_date,sleep_s,hrv,resting_hr,raw"),
            URLQueryItem(name: "order", value: "metric_date.desc"),
            URLQueryItem(name: "limit", value: "30")
        ]
        return await requestArray(url: components.url!).compactMap { json in
            guard let date = json["metric_date"] as? String else { return nil }
            let raw = json["raw"] as? [String: Any] ?? [:]
            return MetricRow(
                date: String(date.prefix(10)),
                sleep: number(json["sleep_s"]),
                hrv: number(json["hrv"]),
                rhr: number(json["resting_hr"]),
                atl: number(raw["atl"]),
                ctl: number(raw["ctl"])
            )
        }
    }

    private static func fetchActivities() async -> [(date: String, load: Int)] {
        let since = ISO8601DateFormatter().string(from: Date(timeIntervalSinceNow: -8 * 86400))
        var components = URLComponents(url: baseURL.appendingPathComponent("activities"), resolvingAgainstBaseURL: false)!
        components.queryItems = [
            URLQueryItem(name: "select", value: "load,start_time"),
            URLQueryItem(name: "start_time", value: "gte.\(since)"),
            URLQueryItem(name: "order", value: "start_time.desc"),
            URLQueryItem(name: "limit", value: "200")
        ]
        return await requestArray(url: components.url!).compactMap { json in
            guard let start = json["start_time"] as? String else { return nil }
            return (String(start.prefix(10)), Int(number(json["load"]) ?? 0))
        }
    }

    private static func lastSevenDailyLoads(from activities: [(date: String, load: Int)]) -> [Int] {
        let calendar = Calendar.current
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        return (0...6).reversed().map { offset in
            guard let date = calendar.date(byAdding: .day, value: -offset, to: Date()) else { return 0 }
            let key = formatter.string(from: date)
            return activities.filter { $0.date == key }.reduce(0) { $0 + $1.load }
        }
    }

    private static func number(_ value: Any?) -> Double? {
        if let n = value as? NSNumber { return n.doubleValue }
        if let s = value as? String { return Double(s) }
        return nil
    }

    private static func requestArray(url: URL) async -> [[String: Any]] {
        var request = URLRequest(url: url)
        request.setValue(anonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(anonKey)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else { return [] }
            return (try JSONSerialization.jsonObject(with: data) as? [[String: Any]]) ?? []
        } catch {
            return []
        }
    }

    static func formatSleep(_ seconds: Double?) -> String? {
        guard let seconds else { return nil }
        let minutes = Int(seconds / 60)
        return "\(minutes / 60)h \(minutes % 60)m"
    }
}
