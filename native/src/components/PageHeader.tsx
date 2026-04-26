import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  EllipsisVertical,
  PanelLeft,
} from "lucide-react-native";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import {
  Image as RNImage,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthContext";
import { useUserAvatar } from "@/hooks/useUserAvatar";
import type { MainTabParamList } from "@/navigation/types";
import { radius, spacing, typography } from "@/theme/tokens";
import { useAppTheme } from "@/theme/useAppTheme";
import { DEFAULT_AVATAR_BACKGROUND } from "@/utils/avatar";

type PageHeaderProps = {
  compact?: boolean;
  fallbackScreen?: keyof MainTabParamList;
  leftControl?: "back" | "sidebar";
  middleContent?: ReactNode;
  onBackPress?: () => void;
  onHomePress?: () => void;
  onSidebarPress?: () => void;
  showHomeButton?: boolean;
  subtitle?: string;
  title: string;
  trailingContent?: ReactNode;
};

export function PageHeader({
  compact = false,
  fallbackScreen = "Chat",
  leftControl = "back",
  middleContent,
  onBackPress,
  onHomePress,
  onSidebarPress,
  showHomeButton = false,
  subtitle,
  title,
  trailingContent,
}: PageHeaderProps) {
  const navigation = useNavigation<BottomTabNavigationProp<MainTabParamList>>();
  const { bootstrap, changeLanguage, session, signOutUser } = useAuth();
  const { mode, palette, toggleTheme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const {
    avatarInitial,
    avatarUrl,
    displayName: nativeDisplayName,
  } = useUserAvatar(session);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false);
  const [isResourcesMenuOpen, setIsResourcesMenuOpen] = useState(false);
  const [pendingLanguageCode, setPendingLanguageCode] = useState<string | null>(
    null
  );

  const dictionary = bootstrap?.i18n.dictionary ?? {};
  const t = useCallback(
    (key: string, fallback: string) => dictionary[key] ?? fallback,
    [dictionary]
  );
  const languages = bootstrap?.i18n.languages ?? [];
  const activeLanguageCode = bootstrap?.i18n.activeLanguage.code ?? null;
  const resourceMenuItems = useMemo(
    () => [
      {
        label: t("user_menu.resources.about", "About Us"),
        screen: "About" as const,
      },
      {
        label: t("user_menu.resources.contact", "Contact Us"),
        screen: "Contact" as const,
      },
      {
        label: t("user_menu.resources.privacy", "Privacy Policy"),
        screen: "PrivacyPolicy" as const,
      },
      {
        label: t("user_menu.resources.terms", "Terms of Service"),
        screen: "TermsOfService" as const,
      },
    ],
    [t]
  );
  const displayName = useMemo(() => {
    const parts = [session?.user.firstName, session?.user.lastName]
      .map((part) => part?.trim())
      .filter(Boolean);
    if (parts.length > 0) {
      return parts.join(" ");
    }
    return session?.user.name?.trim() || nativeDisplayName || session?.user.email || "User";
  }, [
    nativeDisplayName,
    session?.user.email,
    session?.user.firstName,
    session?.user.lastName,
    session?.user.name,
  ]);
  const planLabel = useMemo(() => {
    const plan = bootstrap?.billing.balance?.plan;
    if (!plan) {
      return t("user_menu.manage_subscriptions_status_fallback", "Free Plan");
    }
    const price =
      typeof plan.priceInPaise === "number"
        ? `Rs ${Math.round(plan.priceInPaise / 100).toLocaleString("en-IN")}`
        : null;
    return price ? `${plan.name} (${price})` : plan.name;
  }, [bootstrap?.billing.balance?.plan, t]);

  const closeMenus = useCallback(() => {
    setIsUserMenuOpen(false);
    setIsLanguageMenuOpen(false);
    setIsResourcesMenuOpen(false);
  }, []);

  const navigateFromUserMenu = useCallback(
    (screen: keyof MainTabParamList) => {
      closeMenus();
      navigation.navigate(screen);
    },
    [closeMenus, navigation]
  );

  const handleLanguageSelect = useCallback(
    (code: string) => {
      if (pendingLanguageCode) {
        return;
      }
      setPendingLanguageCode(code);
      setIsLanguageMenuOpen(false);
      changeLanguage(code)
        .catch(() => undefined)
        .finally(() => setPendingLanguageCode(null));
    },
    [changeLanguage, pendingLanguageCode]
  );

  const handleBack = useCallback(() => {
    if (onBackPress) {
      onBackPress();
      return;
    }
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate(fallbackScreen);
  }, [fallbackScreen, navigation, onBackPress]);

  return (
    <View style={[styles.wrap, compact ? styles.wrapCompact : null]}>
      <View
        style={[
          leftControl === "sidebar" ? styles.appHeaderRow : styles.headerRow,
          compact && leftControl !== "sidebar" ? styles.headerRowCompact : null,
        ]}
      >
        <Pressable
          onPress={leftControl === "sidebar" ? onSidebarPress : handleBack}
          style={[
            leftControl === "sidebar"
              ? styles.appIconButton
              : styles.backButton,
            leftControl === "sidebar" ? { borderColor: palette.border } : null,
          ]}
        >
          {leftControl === "sidebar" ? (
            <PanelLeft color={palette.foreground} size={18} />
          ) : (
            <>
              <ArrowLeft color={palette.foreground} size={30} />
              <Text style={[styles.backText, { color: palette.foreground }]}>
                {t("navigation.back", "Back")}
              </Text>
            </>
          )}
        </Pressable>
        {leftControl === "sidebar" ? (
          <>
            {middleContent ?? (
              <Pressable
                accessibilityRole="button"
                onPress={showHomeButton ? onHomePress : undefined}
                style={showHomeButton ? styles.appHomeButton : styles.appTitleButton}
              >
                {showHomeButton ? (
                  <>
                    <ArrowLeft color={palette.foreground} size={24} />
                    <Text
                      style={[styles.appHomeButtonText, { color: palette.foreground }]}
                    >
                      {t("navigation.back", "Back")}
                    </Text>
                  </>
                ) : (
                  <Text
                    numberOfLines={1}
                    style={[styles.appTitleText, { color: palette.foreground }]}
                  >
                    {title}
                  </Text>
                )}
              </Pressable>
            )}
            <View style={styles.appHeaderSpacer} />
            {trailingContent}
          </>
        ) : null}
        <Pressable
          onPress={() => {
            setIsUserMenuOpen((current) => !current);
            setIsLanguageMenuOpen(false);
            setIsResourcesMenuOpen(false);
          }}
          style={[styles.userMenuPill, { borderColor: palette.border }]}
        >
          <View style={styles.userMenuDots}>
            <EllipsisVertical color={palette.mutedForeground} size={18} />
          </View>
          {avatarUrl ? (
            <RNImage source={{ uri: avatarUrl }} style={styles.headerAvatar} />
          ) : (
            <View
              style={[
                styles.headerAvatar,
                { backgroundColor: DEFAULT_AVATAR_BACKGROUND },
              ]}
            >
              <Text style={styles.headerAvatarText}>{avatarInitial}</Text>
            </View>
          )}
        </Pressable>
      </View>

      {compact ? null : (
        <View style={styles.titleBlock}>
          <Text style={[styles.title, { color: palette.foreground }]}>{title}</Text>
          {subtitle ? (
            <Text style={[styles.subtitle, { color: palette.mutedForeground }]}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      )}

      <Modal
        animationType="none"
        onRequestClose={closeMenus}
        transparent
        visible={isUserMenuOpen}
      >
        <View style={styles.modalRoot}>
          <Pressable onPress={closeMenus} style={styles.userMenuBackdrop} />
          <View
            style={[
              styles.userDropdown,
              {
                backgroundColor: palette.popover,
                borderColor: palette.border,
                right: spacing[4],
                top: insets.top + 48,
              },
            ]}
          >
            <Pressable
              onPress={() => navigateFromUserMenu("Profile")}
              style={styles.userMenuItem}
            >
              <Text style={[styles.userMenuPrimary, { color: palette.foreground }]}>
                {displayName}
              </Text>
            </Pressable>
            <View
              style={[styles.userMenuSeparator, { backgroundColor: palette.border }]}
            />
            <Pressable
              onPress={() => navigateFromUserMenu("Profile")}
              style={styles.userMenuItem}
            >
              <Text style={[styles.userMenuText, { color: palette.foreground }]}>
                {t("user_menu.profile", "Profile")}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => navigateFromUserMenu("Subscriptions")}
              style={styles.userMenuItemTall}
            >
              <Text style={[styles.userMenuText, { color: palette.foreground }]}>
                {t("user_menu.manage_subscriptions", "Manage Subscriptions")}
              </Text>
              <Text
                style={[
                  styles.userMenuSubText,
                  { color: palette.mutedForeground },
                ]}
              >
                {planLabel}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => navigateFromUserMenu("Recharge")}
              style={styles.userMenuItem}
            >
              <Text style={[styles.userMenuText, { color: palette.foreground }]}>
                {t("user_menu.upgrade_plan", "Upgrade plan")}
              </Text>
            </Pressable>
            {bootstrap?.featureAccess.forum ? (
              <>
                <View
                  style={[
                    styles.userMenuSeparator,
                    { backgroundColor: palette.border },
                  ]}
                />
                <Pressable
                  onPress={() => navigateFromUserMenu("Forum")}
                  style={styles.userMenuItem}
                >
                  <Text
                    style={[styles.userMenuText, { color: palette.foreground }]}
                  >
                    {t("user_menu.community_forum", "Community Forum")}
                  </Text>
                </Pressable>
              </>
            ) : null}
            <View
              style={[styles.userMenuSeparator, { backgroundColor: palette.border }]}
            />
            <Pressable
              onPress={() => {
                setIsLanguageMenuOpen((current) => !current);
                setIsResourcesMenuOpen(false);
              }}
              style={styles.userMenuItemRow}
            >
              <Text style={[styles.userMenuText, { color: palette.foreground }]}>
                {t("user_menu.language", "Language")}
              </Text>
              {isLanguageMenuOpen ? (
                <ChevronDown color={palette.foreground} size={16} />
              ) : (
                <ChevronRight color={palette.foreground} size={16} />
              )}
            </Pressable>
            {isLanguageMenuOpen ? (
              <View style={styles.userSubMenu}>
                {languages
                  .filter((language) => language.isActive)
                  .map((language) => (
                    <Pressable
                      key={language.code}
                      disabled={Boolean(pendingLanguageCode)}
                      onPress={() => handleLanguageSelect(language.code)}
                      style={styles.userSubMenuItem}
                    >
                      <Text
                        style={[
                          styles.userMenuSubText,
                          { color: palette.mutedForeground },
                        ]}
                      >
                        {language.name}
                        {language.code === activeLanguageCode
                          ? ` · ${
                              pendingLanguageCode === language.code
                                ? t("user_menu.language.updating", "Updating...")
                                : t("user_menu.language.active", "Active")
                            }`
                          : ""}
                      </Text>
                    </Pressable>
                  ))}
              </View>
            ) : null}
            <Pressable
              onPress={() => {
                setIsResourcesMenuOpen((current) => !current);
                setIsLanguageMenuOpen(false);
              }}
              style={styles.userMenuItemRow}
            >
              <Text style={[styles.userMenuText, { color: palette.foreground }]}>
                {t("user_menu.resources", "Resources")}
              </Text>
              {isResourcesMenuOpen ? (
                <ChevronDown color={palette.foreground} size={16} />
              ) : (
                <ChevronRight color={palette.foreground} size={16} />
              )}
            </Pressable>
            {isResourcesMenuOpen ? (
              <View style={styles.userSubMenu}>
                {resourceMenuItems.map((item) => (
                  <Pressable
                    key={item.screen}
                    onPress={() => navigateFromUserMenu(item.screen)}
                    style={styles.userSubMenuItem}
                  >
                    <Text
                      style={[
                        styles.userMenuSubText,
                        { color: palette.mutedForeground },
                      ]}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            <View
              style={[styles.userMenuSeparator, { backgroundColor: palette.border }]}
            />
            <Pressable onPress={toggleTheme} style={styles.userMenuItem}>
              <Text style={[styles.userMenuText, { color: palette.foreground }]}>
                {mode === "dark"
                  ? t("user_menu.theme.light", "Light mode")
                  : t("user_menu.theme.dark", "Dark mode")}
              </Text>
            </Pressable>
            <View
              style={[styles.userMenuSeparator, { backgroundColor: palette.border }]}
            />
            <Pressable
              onPress={() => {
                closeMenus();
                signOutUser().catch(() => undefined);
              }}
              style={styles.userMenuItem}
            >
              <Text style={[styles.userMenuText, { color: palette.destructive }]}>
                {t("user_menu.sign_out", "Sign out")}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing[4],
  },
  wrapCompact: {
    marginBottom: spacing[2],
  },
  appHeaderRow: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  appIconButton: {
    height: 32,
    width: 32,
    borderWidth: 1,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  appHomeButton: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[1],
    paddingHorizontal: 4,
  },
  appTitleButton: {
    minHeight: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  appTitleText: {
    fontSize: 16,
    fontWeight: "500",
    flexShrink: 1,
    maxWidth: 170,
    paddingHorizontal: 8,
  },
  appHomeButtonText: {
    fontSize: 16,
    fontWeight: "500",
  },
  appHeaderSpacer: {
    flex: 1,
    minWidth: 4,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing[3],
  },
  headerRowCompact: {
    marginBottom: 0,
  },
  backButton: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  backText: {
    fontSize: 20,
    fontWeight: "500",
  },
  titleBlock: {
    gap: spacing[1],
  },
  title: {
    fontSize: typography.title,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: typography.body,
    lineHeight: 22,
  },
  modalRoot: {
    flex: 1,
  },
  userMenuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
  },
  userMenuPill: {
    height: 34,
    minWidth: 62,
    borderRadius: 17,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: 5,
    paddingRight: 2,
  },
  userMenuDots: {
    width: 22,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  headerAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  headerAvatarText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
  userDropdown: {
    position: "absolute",
    width: 256,
    borderWidth: 1,
    borderRadius: radius.sm,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.16,
    shadowRadius: 6,
    elevation: 22,
  },
  userMenuItem: {
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  userMenuItemTall: {
    minHeight: 52,
    justifyContent: "center",
    paddingHorizontal: 12,
    gap: 2,
  },
  userMenuItemRow: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
  },
  userMenuPrimary: {
    fontSize: 16,
    fontWeight: "700",
  },
  userMenuText: {
    fontSize: 16,
  },
  userMenuSubText: {
    fontSize: 14,
  },
  userMenuSeparator: {
    height: 1,
  },
  userSubMenu: {
    paddingBottom: 4,
  },
  userSubMenuItem: {
    minHeight: 30,
    justifyContent: "center",
    paddingHorizontal: 18,
  },
});
