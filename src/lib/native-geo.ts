/**
 * Capacitor native bridge for background GPS.
 * On web these imports are inert — isNativePlatform() is false.
 */

export type NativeLocation = {
  latitude: number;
  longitude: number;
  accuracy: number;
  speed: number | null;
  time: number | null;
};

type BgPlugin = {
  addWatcher: (
    options: {
      backgroundMessage?: string;
      backgroundTitle?: string;
      requestPermissions?: boolean;
      stale?: boolean;
      distanceFilter?: number;
    },
    callback: (
      location: NativeLocation | undefined,
      error: { code: string; message?: string } | undefined,
    ) => void,
  ) => Promise<string>;
  removeWatcher: (options: { id: string }) => Promise<void>;
  openSettings: () => Promise<void>;
};

let cachedNative: boolean | null = null;

export async function isNativeApp(): Promise<boolean> {
  if (cachedNative != null) return cachedNative;
  if (typeof window === "undefined") {
    cachedNative = false;
    return false;
  }
  try {
    const { Capacitor } = await import("@capacitor/core");
    cachedNative = Capacitor.isNativePlatform();
  } catch {
    cachedNative = false;
  }
  return cachedNative;
}

async function getBg(): Promise<BgPlugin> {
  const { registerPlugin } = await import("@capacitor/core");
  return registerPlugin<BgPlugin>("BackgroundGeolocation");
}

export async function startNativeBackgroundGeo(
  onLocation: (loc: NativeLocation) => void,
  onError: (message: string) => void,
): Promise<string> {
  const BackgroundGeolocation = await getBg();
  const id = await BackgroundGeolocation.addWatcher(
    {
      backgroundMessage:
        "Идёт учёт рабочего дня. Остановите GPS в приложении QALQAN, чтобы выключить.",
      backgroundTitle: "QALQAN · GPS",
      requestPermissions: true,
      stale: false,
      // Slightly denser than walking stride — better street/office transitions.
      distanceFilter: 25,
    },
    (location, error) => {
      if (error) {
        if (error.code === "NOT_AUTHORIZED") {
          onError("Нет разрешения на геолокацию. Разрешите «Всегда» / фон в настройках.");
          void BackgroundGeolocation.openSettings().catch(() => undefined);
        } else {
          onError(error.message || error.code || "Ошибка GPS");
        }
        return;
      }
      if (!location) return;
      onLocation(location);
    },
  );
  return id;
}

export async function stopNativeBackgroundGeo(watcherId: string | null) {
  if (!watcherId) return;
  try {
    const BackgroundGeolocation = await getBg();
    await BackgroundGeolocation.removeWatcher({ id: watcherId });
  } catch {
    /* ignore */
  }
}
