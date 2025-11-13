import Constants from "expo-constants";

type ExtraFields = {
  apiBaseUrl?: string;
  webBaseUrl?: string;
  appBaseUrl?: string;
  timezone?: string;
};

export function getExtra(): ExtraFields {
  const expoConfig = Constants.expoConfig;
  if (expoConfig?.extra) {
    return expoConfig.extra as ExtraFields;
  }

  const manifest = (Constants as any).manifest2;
  const easConfig = manifest?.extra?.expoClient?.extra;
  if (easConfig) {
    return easConfig as ExtraFields;
  }

  return {};
}
