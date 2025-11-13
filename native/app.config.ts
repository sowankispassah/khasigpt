import { config as loadEnv } from "dotenv";
import type { ExpoConfig } from "@expo/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const configFilename = fileURLToPath(import.meta.url);
const configDirname = path.dirname(configFilename);

loadEnv();
loadEnv({ path: path.resolve(configDirname, "../.env"), override: false });

const name = "KhasiGPT Native";
const slug = "khasigpt-native";
const version = "1.0.0";

const resolvedAppBaseUrl =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  process.env.APP_BASE_URL ??
  process.env.NEXTAUTH_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  "http://localhost:3000";

const apiBaseUrl = resolvedAppBaseUrl.replace(/\/$/, "");

const webBaseUrl =
  process.env.EXPO_PUBLIC_WEB_BASE_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  apiBaseUrl;

const config: ExpoConfig = {
  name,
  slug,
  version,
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "khasigpt",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  splash: {
    image: "./assets/images/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: "#ffffff",
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: process.env.IOS_BUNDLE_IDENTIFIER ?? "com.khasigpt.app",
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/images/adaptive-icon.png",
      backgroundColor: "#ffffff",
    },
    edgeToEdge: true,
    package: process.env.ANDROID_PACKAGE ?? "com.khasigpt.app",
  },
  web: {
    bundler: "metro",
    output: "static",
    favicon: "./assets/images/favicon.png",
  },
  plugins: ["expo-router", "expo-secure-store"],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    apiBaseUrl,
    webBaseUrl,
    appBaseUrl: apiBaseUrl,
    timezone: process.env.EXPO_PUBLIC_TIMEZONE ?? "Asia/Kolkata",
    eas: {
      projectId: process.env.EAS_PROJECT_ID ?? undefined,
    },
  },
};

export default config;
