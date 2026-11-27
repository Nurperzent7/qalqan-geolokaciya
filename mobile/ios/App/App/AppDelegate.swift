import UIKit
import CoreLocation
import WebKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Native GPS starts here, so it also runs when iOS relaunches the app
        // in the background for a location event (no UI scene in that case).
        NativeTracker.shared.start()
        return true
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}

/// Native background GPS for QALQAN, independent of the web page.
///
/// - On launch asks for location access, then for "Always". If "Always" is
///   not granted, shows an alert with a button to open Settings.
/// - Takes the employee's session token from the web page's localStorage
///   (key `qalqan_app_token`, set by the web login) and looks up the employee
///   via GET /api/state.
/// - Sends one point every 30 seconds to POST /api/points, in the foreground
///   and in the background. Points are queued on the phone while offline.
final class NativeTracker: NSObject, CLLocationManagerDelegate {
    static let shared = NativeTracker()

    private let origin = "https://qalqan-geolokaciya.apps.grok.bot"
    private lazy var baseURL = URL(string: origin)!
    private let sendInterval: TimeInterval = 30
    private let maxBatch = 50
    private let maxQueue = 2000
    private let maxFixAge: TimeInterval = 300

    private let manager = CLLocationManager()
    private let defaults = UserDefaults.standard
    private let tokenKey = "qalqan.native.token"
    private let employeeKey = "qalqan.native.employee"
    private let queueKey = "qalqan.native.queue"

    private weak var controller: CAPBridgeViewController?
    private var timer: Timer?
    private var lastLocation: CLLocation?
    private var queue: [[String: Any]] = []
    private var started = false
    private var updating = false
    private var sending = false
    private var askedAlways = false
    private var alertVisible = false
    private var lookingUpEmployee = false
    private var backgroundTask: UIBackgroundTaskIdentifier = .invalid

    private var token: String? {
        get { defaults.string(forKey: tokenKey) }
        set { defaults.set(newValue, forKey: tokenKey) }
    }

    private var employeeId: String? {
        get { defaults.string(forKey: employeeKey) }
        set { defaults.set(newValue, forKey: employeeKey) }
    }

    private lazy var deviceId: String = {
        "ios-" + (UIDevice.current.identifierForVendor?.uuidString ?? UUID().uuidString)
    }()

    private let isoFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    // MARK: Lifecycle

    func start() {
        guard !started else { return }
        started = true
        UIDevice.current.isBatteryMonitoringEnabled = true
        if let saved = defaults.array(forKey: queueKey) as? [[String: Any]] {
            queue = saved
        }
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.distanceFilter = kCLDistanceFilterNone
        manager.pausesLocationUpdatesAutomatically = false
        manager.activityType = .other
        handleAuthorization()
    }

    func attach(_ controller: CAPBridgeViewController) {
        self.controller = controller
    }

    /// Called by SceneDelegate whenever the app comes to the foreground.
    func appDidBecomeActive() {
        handleAuthorization()
        refreshCredentials()
        flush()
    }

    // MARK: Permission

    private func handleAuthorization() {
        switch manager.authorizationStatus {
        case .notDetermined:
            manager.requestWhenInUseAuthorization()
        case .authorizedWhenInUse:
            beginUpdates()
            if !askedAlways {
                askedAlways = true
                // iOS shows "Change to Always Allow?" right away (once per install).
                manager.requestAlwaysAuthorization()
            } else {
                showAlwaysAlert()
            }
        case .authorizedAlways:
            beginUpdates()
        case .denied, .restricted:
            showAlwaysAlert()
        @unknown default:
            break
        }
    }

    private func showAlwaysAlert() {
        // Delay so a system permission prompt that is still on screen wins;
        // while it is visible the app is not active and we skip.
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
            guard let self = self,
                  UIApplication.shared.applicationState == .active,
                  self.manager.authorizationStatus != .authorizedAlways,
                  !self.alertVisible,
                  let host = self.topController() else { return }
            let alert = UIAlertController(
                title: "Нужен доступ «Всегда»",
                message: "QALQAN отмечает рабочий день по геолокации, в том числе когда приложение свёрнуто.\n\nОткройте Настройки → Геолокация и выберите «Всегда».",
                preferredStyle: .alert
            )
            alert.addAction(UIAlertAction(title: "Открыть настройки", style: .default) { _ in
                self.alertVisible = false
                if let url = URL(string: UIApplication.openSettingsURLString) {
                    UIApplication.shared.open(url)
                }
            })
            alert.addAction(UIAlertAction(title: "Позже", style: .cancel) { _ in
                self.alertVisible = false
            })
            self.alertVisible = true
            host.present(alert, animated: true)
        }
    }

    private func topController() -> UIViewController? {
        var top: UIViewController? = controller
        while let presented = top?.presentedViewController {
            top = presented
        }
        return top
    }

    // MARK: Location

    private func beginUpdates() {
        guard !updating else { return }
        updating = true
        manager.allowsBackgroundLocationUpdates = true
        manager.showsBackgroundLocationIndicator = true
        manager.startUpdatingLocation()
        if CLLocationManager.significantLocationChangeMonitoringAvailable() {
            // Lets iOS relaunch the app after it was unloaded (not after a swipe-away).
            manager.startMonitoringSignificantLocationChanges()
        }
        let t = Timer(timeInterval: sendInterval, repeats: true) { [weak self] _ in
            self?.tick()
        }
        RunLoop.main.add(t, forMode: .common)
        timer = t
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        handleAuthorization()
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let loc = locations.last else { return }
        let isFirst = lastLocation == nil
        lastLocation = loc
        if isFirst {
            tick()
        }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        // Temporary GPS errors are fine: the next fix arrives by itself.
    }

    // MARK: Sending

    private func tick() {
        if UIApplication.shared.applicationState == .active {
            refreshCredentials()
        }
        if let loc = lastLocation,
           let emp = employeeId,
           -loc.timestamp.timeIntervalSinceNow <= maxFixAge {
            enqueue(point(for: loc, employee: emp))
        }
        flush()
    }

    private func point(for loc: CLLocation, employee: String) -> [String: Any] {
        let speed = max(loc.speed, 0)
        let level = UIDevice.current.batteryLevel
        let simulated = loc.sourceInformation?.isSimulatedBySoftware ?? false
        return [
            "device_id": deviceId,
            "employee_id": employee,
            "ts": isoFormatter.string(from: Date()),
            "lat": loc.coordinate.latitude,
            "lon": loc.coordinate.longitude,
            "accuracy_m": min(max(loc.horizontalAccuracy, 0), 5000),
            "speed_mps": min(speed, 100),
            "is_moving": speed > 0.5,
            "mock": simulated,
            "battery": level >= 0 ? Double(level) : 1.0,
        ]
    }

    private func enqueue(_ point: [String: Any]) {
        queue.append(point)
        if queue.count > maxQueue {
            queue.removeFirst(queue.count - maxQueue)
        }
        saveQueue()
    }

    private func saveQueue() {
        defaults.set(queue, forKey: queueKey)
    }

    private func flush() {
        guard !sending, !queue.isEmpty, let token = token, !token.isEmpty else { return }
        guard let emp = queue.first?["employee_id"] as? String else {
            queue.removeFirst()
            saveQueue()
            return
        }
        // The server accepts one employee per batch.
        let batch = Array(
            queue.prefix(while: { ($0["employee_id"] as? String) == emp }).prefix(maxBatch)
        )
        guard let body = try? JSONSerialization.data(withJSONObject: ["points": batch]) else {
            queue.removeFirst(batch.count)
            saveQueue()
            return
        }

        var req = URLRequest(url: baseURL.appendingPathComponent("api/points"))
        req.httpMethod = "POST"
        req.timeoutInterval = 20
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("CursorApp", forHTTPHeaderField: "X-Requested-With")
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.httpBody = body

        sending = true
        beginBackgroundTime()

        URLSession.shared.dataTask(with: req) { [weak self] _, response, error in
            DispatchQueue.main.async {
                guard let self = self else { return }
                defer { self.endBackgroundTime() }
                self.sending = false
                let status = (response as? HTTPURLResponse)?.statusCode ?? 0

                // No network, rate limit or server trouble: keep points, retry later.
                if error != nil || status == 0 || status == 429 || status >= 500 {
                    return
                }
                // Session expired or signed out: keep points, wait for a new login.
                if status == 401 {
                    self.token = nil
                    self.employeeId = nil
                    return
                }
                // 2xx delivered; other 4xx (collection off, bad data) never succeed: drop.
                self.queue.removeFirst(min(batch.count, self.queue.count))
                self.saveQueue()
                if (200..<300).contains(status) && !self.queue.isEmpty {
                    self.flush()
                }
            }
        }.resume()
    }

    /// Extra time so a send started right before suspension can finish.
    private func beginBackgroundTime() {
        endBackgroundTime()
        backgroundTask = UIApplication.shared.beginBackgroundTask { [weak self] in
            self?.endBackgroundTime()
        }
    }

    private func endBackgroundTime() {
        guard backgroundTask != .invalid else { return }
        UIApplication.shared.endBackgroundTask(backgroundTask)
        backgroundTask = .invalid
    }

    // MARK: Session from the web page

    private func refreshCredentials() {
        guard let webView = controller?.webView else { return }
        let script = "(function(){try{return JSON.stringify({o:location.origin,t:localStorage.getItem('qalqan_app_token')||''})}catch(e){return ''}})()"
        webView.evaluateJavaScript(script) { [weak self] result, _ in
            guard let self = self,
                  let text = result as? String,
                  let data = text.data(using: .utf8),
                  let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
                  (obj["o"] as? String) == self.origin,
                  let value = obj["t"] as? String else { return }

            if value.isEmpty {
                // Signed out in the app: stop sending until the next login.
                if self.token != nil {
                    self.token = nil
                    self.employeeId = nil
                }
                return
            }
            if value != self.token {
                self.token = value
                self.employeeId = nil
                self.lookUpEmployee(token: value)
            } else if self.employeeId == nil {
                self.lookUpEmployee(token: value)
            }
        }
    }

    private func lookUpEmployee(token: String) {
        guard !lookingUpEmployee else { return }
        lookingUpEmployee = true
        var req = URLRequest(url: baseURL.appendingPathComponent("api/state"))
        req.cachePolicy = .reloadIgnoringLocalCacheData
        req.timeoutInterval = 30
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        URLSession.shared.dataTask(with: req) { [weak self] data, response, _ in
            DispatchQueue.main.async {
                guard let self = self else { return }
                self.lookingUpEmployee = false
                guard (response as? HTTPURLResponse)?.statusCode == 200,
                      self.token == token,
                      let data = data,
                      let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
                      let viewer = obj["viewer"] as? [String: Any] else { return }
                // Admins have no employee_id: they are not tracked.
                let id = (viewer["employee_id"] as? String) ?? (viewer["employeeId"] as? String)
                self.employeeId = (id?.isEmpty == false) ? id : nil
                self.tick()
            }
        }.resume()
    }
}
