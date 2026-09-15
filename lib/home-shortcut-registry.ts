import type { UserRole } from "@/lib/db/schema";

export type HomeShortcutActionType = "feature" | "prompt" | "tool";
export type HomeShortcutTargetKind = Exclude<
  HomeShortcutActionType,
  "prompt"
>;
export type HomeShortcutPlatform = "android" | "web";

export type HomeShortcutAccessId =
  | "always"
  | "calculator"
  | "creator_only"
  | "explore_meghalaya"
  | "image_generation"
  | "jobs"
  | "live_translation"
  | "study"
  | "translate"
  | "voice_chat";

export type HomeShortcutTargetDefinition = {
  access: HomeShortcutAccessId;
  androidScreen?: string;
  id: string;
  kind: HomeShortcutTargetKind;
  label: string;
  translationKey: string;
  webHref?: string;
};

export const HOME_SHORTCUT_TARGETS = [
  {
    access: "calculator",
    androidScreen: "Calculator",
    id: "calculator",
    kind: "feature",
    label: "Calculator",
    translationKey: "home_shortcut.target.calculator",
    webHref: "/calculator",
  },
  {
    access: "explore_meghalaya",
    androidScreen: "Explore",
    id: "explore_meghalaya",
    kind: "feature",
    label: "Explore Meghalaya",
    translationKey: "home_shortcut.target.explore_meghalaya",
    webHref: "/explore",
  },
  {
    access: "always",
    androidScreen: "Forum",
    id: "community",
    kind: "feature",
    label: "Community / Forum",
    translationKey: "home_shortcut.target.community",
    webHref: "/forum",
  },
  {
    access: "jobs",
    androidScreen: "Jobs",
    id: "jobs",
    kind: "feature",
    label: "Jobs",
    translationKey: "home_shortcut.target.jobs",
    webHref: "/chat?mode=jobs&new=1",
  },
  {
    access: "study",
    androidScreen: "Study",
    id: "study",
    kind: "feature",
    label: "Study Mode",
    translationKey: "home_shortcut.target.study",
    webHref: "/chat?mode=study&new=1",
  },
  {
    access: "translate",
    androidScreen: "Translate",
    id: "translate",
    kind: "feature",
    label: "Translate",
    translationKey: "home_shortcut.target.translate",
    webHref: "/translate",
  },
  {
    access: "live_translation",
    androidScreen: "LiveTranslation",
    id: "live_translation",
    kind: "feature",
    label: "Live Translation",
    translationKey: "home_shortcut.target.live_translation",
    webHref: "/live-translation",
  },
  {
    access: "always",
    androidScreen: "Subscriptions",
    id: "subscriptions",
    kind: "feature",
    label: "Subscriptions / Credits",
    translationKey: "home_shortcut.target.subscriptions",
    webHref: "/subscriptions",
  },
  {
    access: "always",
    androidScreen: "Recharge",
    id: "recharge",
    kind: "feature",
    label: "Recharge / Upgrade",
    translationKey: "home_shortcut.target.recharge",
    webHref: "/recharge",
  },
  {
    access: "always",
    androidScreen: "Profile",
    id: "profile",
    kind: "feature",
    label: "Profile",
    translationKey: "home_shortcut.target.profile",
    webHref: "/profile",
  },
  {
    access: "creator_only",
    androidScreen: "CreatorDashboard",
    id: "creator_dashboard",
    kind: "feature",
    label: "Creator Dashboard",
    translationKey: "home_shortcut.target.creator_dashboard",
    webHref: "/creator-dashboard",
  },
  {
    access: "always",
    androidScreen: "About",
    id: "about",
    kind: "feature",
    label: "About",
    translationKey: "home_shortcut.target.about",
    webHref: "/about",
  },
  {
    access: "always",
    androidScreen: "Contact",
    id: "contact",
    kind: "feature",
    label: "Contact",
    translationKey: "home_shortcut.target.contact",
    webHref: "/about#contact",
  },
  {
    access: "always",
    androidScreen: "PrivacyPolicy",
    id: "privacy_policy",
    kind: "feature",
    label: "Privacy Policy",
    translationKey: "home_shortcut.target.privacy_policy",
    webHref: "/privacy-policy",
  },
  {
    access: "always",
    androidScreen: "TermsOfService",
    id: "terms_of_service",
    kind: "feature",
    label: "Terms of Service",
    translationKey: "home_shortcut.target.terms_of_service",
    webHref: "/terms-of-service",
  },
  {
    access: "image_generation",
    id: "image_generation",
    kind: "tool",
    label: "Image Generation",
    translationKey: "home_shortcut.target.image_generation",
  },
  {
    access: "voice_chat",
    id: "voice_chat",
    kind: "tool",
    label: "Voice Chat",
    translationKey: "home_shortcut.target.voice_chat",
  },
] as const satisfies readonly HomeShortcutTargetDefinition[];

export type HomeShortcutTargetId =
  (typeof HOME_SHORTCUT_TARGETS)[number]["id"];

const TARGETS_BY_ID = new Map<string, HomeShortcutTargetDefinition>(
  HOME_SHORTCUT_TARGETS.map((target) => [target.id, target])
);

export function getHomeShortcutTarget(
  targetId: string | null | undefined
): HomeShortcutTargetDefinition | null {
  if (!targetId) {
    return null;
  }
  return TARGETS_BY_ID.get(targetId) ?? null;
}

export function getHomeShortcutTargets(
  kind?: HomeShortcutTargetKind
): HomeShortcutTargetDefinition[] {
  return kind
    ? HOME_SHORTCUT_TARGETS.filter((target) => target.kind === kind)
    : [...HOME_SHORTCUT_TARGETS];
}

export function isHomeShortcutActionType(
  value: unknown
): value is HomeShortcutActionType {
  return value === "prompt" || value === "feature" || value === "tool";
}

export function isHomeShortcutTargetAvailableForPlatform(
  target: HomeShortcutTargetDefinition,
  platform: HomeShortcutPlatform
) {
  if (target.kind === "tool") {
    return true;
  }
  return platform === "web"
    ? Boolean(target.webHref)
    : Boolean(target.androidScreen);
}

export function isRoleAllowedForHomeShortcutTarget(
  target: HomeShortcutTargetDefinition,
  role: UserRole | null | undefined
) {
  return target.access !== "creator_only" || role === "creator";
}
