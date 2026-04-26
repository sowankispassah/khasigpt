import * as ImagePicker from "expo-image-picker";
import { useFocusEffect } from "@react-navigation/native";
import {
  ActivityIndicator,
  Image as RNImage,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useCallback, useState } from "react";
import { api } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { useUserAvatar } from "@/hooks/useUserAvatar";
import { spacing, typography } from "@/theme/tokens";
import { useAppTheme } from "@/theme/useAppTheme";
import {
  DEFAULT_AVATAR_BACKGROUND,
  getInitial,
} from "@/utils/avatar";

type StatusMessage = {
  message: string;
  type: "error" | "info" | "success";
} | null;

function normalizeAssetName(uri: string, fallback = "profile-image.jpg") {
  const filename = uri.split("/").at(-1)?.split("?")[0];
  return filename && filename.length > 0 ? filename : fallback;
}

export function ProfileScreen() {
  const { refresh, session } = useAuth();
  const { palette } = useAppTheme();
  const { displayName, refreshAvatar } = useUserAvatar(session);
  const [firstName, setFirstName] = useState(session?.user.firstName ?? "");
  const [lastName, setLastName] = useState(session?.user.lastName ?? "");
  const [dateOfBirth, setDateOfBirth] = useState(session?.user.dateOfBirth ?? "");
  const [isDateOfBirthLocked, setIsDateOfBirthLocked] = useState(
    Boolean(session?.user.dateOfBirth)
  );
  const [email, setEmail] = useState(session?.user.email ?? "");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [pendingAvatarAsset, setPendingAvatarAsset] =
    useState<ImagePicker.ImagePickerAsset | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [profileStatus, setProfileStatus] = useState<StatusMessage>(null);
  const [avatarStatus, setAvatarStatus] = useState<StatusMessage>(null);
  const [passwordStatus, setPasswordStatus] = useState<StatusMessage>(null);
  const [isAvatarPreparing, setIsAvatarPreparing] = useState(false);
  const [isProfileSaving, setIsProfileSaving] = useState(false);
  const [isAvatarSaving, setIsAvatarSaving] = useState(false);
  const [isPasswordSaving, setIsPasswordSaving] = useState(false);

  const t = useCallback((_: string, fallback: string) => fallback, []);

  const loadProfile = useCallback(async () => {
    const payload = await api.profile();
    setFirstName(payload.user.firstName ?? "");
    setLastName(payload.user.lastName ?? "");
    setDateOfBirth(payload.user.dateOfBirth ?? "");
    setIsDateOfBirthLocked(Boolean(payload.user.dateOfBirth));
    setEmail(payload.user.email ?? "");
    setAvatar(payload.user.avatar);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadProfile().catch(() => undefined);
    }, [loadProfile])
  );

  const handleChooseAvatar = async () => {
    setAvatarStatus(null);
    setIsAvatarPreparing(true);
    setAvatarStatus({
      message: t("profile.picture.preparing", "Preparing image..."),
      type: "info",
    });
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: false,
        base64: true,
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.92,
      });

      if (result.canceled || !result.assets[0]) {
        setAvatarStatus(null);
        return;
      }

      setPendingAvatarAsset(result.assets[0]);
      setAvatarStatus({
        message: t("profile.picture.ready", "Image selected. Upload to save."),
        type: "success",
      });
    } finally {
      setIsAvatarPreparing(false);
    }
  };

  const handleUploadAvatar = async () => {
    if (!pendingAvatarAsset) {
      setAvatarStatus({
        message: t(
          "profile.picture.error.choose_before_upload",
          "Choose an image before uploading."
        ),
        type: "error",
      });
      return;
    }

    setIsAvatarSaving(true);
    setAvatarStatus({
      message: t("profile.picture.uploading", "Uploading image..."),
      type: "info",
    });
    try {
      const base64 = pendingAvatarAsset.base64 ?? null;
      if (!base64) {
        throw new Error("Selected image could not be prepared for upload.");
      }
      const response = await api.profileAvatarUpload({
        base64,
        mimeType: pendingAvatarAsset.mimeType ?? "image/jpeg",
        name: normalizeAssetName(pendingAvatarAsset.uri),
      });
      setAvatar(response.image ?? null);
      setPendingAvatarAsset(null);
      refreshAvatar(response.image ?? null);
      await refresh();
      setAvatarStatus({
        message: t("profile.picture.success.upload", "Profile picture updated."),
        type: "success",
      });
    } catch (error) {
      setAvatarStatus({
        message:
          error instanceof Error
            ? error.message
            : t(
                "profile.picture.error.upload_generic",
                "Failed to update profile image. Please try again."
              ),
        type: "error",
      });
    } finally {
      setIsAvatarSaving(false);
    }
  };

  const handleRemoveAvatar = async () => {
    if (!avatar && !pendingAvatarAsset) {
      return;
    }
    setIsAvatarSaving(true);
    setAvatarStatus({
      message: t("profile.picture.removing", "Removing image..."),
      type: "info",
    });
    try {
      await api.profileAvatarDelete();
      setAvatar(null);
      setPendingAvatarAsset(null);
      refreshAvatar(null);
      await refresh();
      setAvatarStatus({
        message: t("profile.picture.success.remove", "Profile picture removed."),
        type: "success",
      });
    } catch (error) {
      setAvatarStatus({
        message:
          error instanceof Error
            ? error.message
            : t(
                "profile.picture.error.remove_generic",
                "Failed to remove profile image. Please try again."
              ),
        type: "error",
      });
    } finally {
      setIsAvatarSaving(false);
    }
  };

  const handleSaveProfile = async () => {
    setIsProfileSaving(true);
    setProfileStatus(null);
    try {
      const trimmedDateOfBirth = dateOfBirth.trim();
      await api.updateProfile({
        firstName,
        lastName,
        ...(!isDateOfBirthLocked && trimmedDateOfBirth
          ? { dateOfBirth: trimmedDateOfBirth }
          : {}),
      });
      await refresh();
      await loadProfile();
      setProfileStatus({
        message: t(
          "profile.name.success",
          "Profile details updated successfully."
        ),
        type: "success",
      });
    } catch (error) {
      setProfileStatus({
        message:
          error instanceof Error
            ? error.message
            : t("profile.name.error", "Unable to update profile."),
        type: "error",
      });
    } finally {
      setIsProfileSaving(false);
    }
  };

  const handleSavePassword = async () => {
    setIsPasswordSaving(true);
    setPasswordStatus(null);
    try {
      await api.updateProfilePassword({ confirmPassword, password });
      setPassword("");
      setConfirmPassword("");
      setPasswordStatus({
        message: t(
          "profile.password.success",
          "Password updated successfully."
        ),
        type: "success",
      });
    } catch (error) {
      setPasswordStatus({
        message:
          error instanceof Error
            ? error.message
            : t("profile.password.error", "Unable to update password."),
        type: "error",
      });
    } finally {
      setIsPasswordSaving(false);
    }
  };

  const visibleAvatarUri = pendingAvatarAsset?.uri ?? avatar ?? null;

  return (
    <Screen style={styles.screen} padded={false}>
      <View style={styles.content}>
        <PageHeader
          subtitle="Update your account information and security preferences."
          title="Profile"
        />

        <Card>
          <Text style={[styles.sectionTitle, { color: palette.foreground }]}>
            Profile picture
          </Text>
          <Text style={[styles.meta, { color: palette.mutedForeground }]}>
            Upload an image to personalise your account. This picture appears in
            the chat header and menus.
          </Text>
          <View style={styles.avatarRow}>
            {visibleAvatarUri ? (
              <RNImage source={{ uri: visibleAvatarUri }} style={styles.avatar} />
            ) : (
              <View
                style={[
                  styles.avatar,
                  { backgroundColor: DEFAULT_AVATAR_BACKGROUND },
                ]}
              >
                <Text style={styles.initial}>{getInitial(email || displayName)}</Text>
              </View>
            )}
          </View>
          <View style={styles.actionRow}>
            <Button onPress={handleChooseAvatar} variant="outline">
              {isAvatarPreparing ? "Preparing image..." : "Choose image"}
            </Button>
            <Button
              disabled={!pendingAvatarAsset || isAvatarSaving || isAvatarPreparing}
              onPress={handleUploadAvatar}
            >
              <View style={styles.buttonContent}>
                {isAvatarSaving ? (
                  <ActivityIndicator color={palette.primaryForeground} size="small" />
                ) : null}
                <Text style={[styles.buttonText, { color: palette.primaryForeground }]}>
                  {isAvatarSaving ? "Uploading image..." : "Upload"}
                </Text>
              </View>
            </Button>
            <Button
              disabled={
                (!avatar && !pendingAvatarAsset) ||
                isAvatarSaving ||
                isAvatarPreparing
              }
              loading={false}
              onPress={handleRemoveAvatar}
              variant="ghost"
            >
              Remove
            </Button>
          </View>
          <Text style={[styles.meta, { color: palette.mutedForeground }]}>
            PNG, JPG, or WEBP up to 2 MB.
          </Text>
          {avatarStatus ? (
            avatarStatus.type === "info" ? (
              <View style={styles.inlineStatusRow}>
                <ActivityIndicator color={palette.mutedForeground} size="small" />
                <Text style={[styles.meta, { color: palette.mutedForeground }]}>
                  {avatarStatus.message}
                </Text>
              </View>
            ) : (
              <Text
                style={[
                  styles.meta,
                  {
                    color:
                      avatarStatus.type === "error"
                        ? palette.destructive
                        : palette.success,
                  },
                ]}
              >
                {avatarStatus.message}
              </Text>
            )
          ) : null}
        </Card>

        <Card>
          <Text style={[styles.sectionTitle, { color: palette.foreground }]}>
            Personal details
          </Text>
          <Text style={[styles.meta, { color: palette.mutedForeground }]}>
            Update how your name appears across the app.
          </Text>
          <TextField label="First name" onChangeText={setFirstName} value={firstName} />
          <TextField label="Last name" onChangeText={setLastName} value={lastName} />
          <TextField
            editable={!isDateOfBirthLocked}
            label="Date of birth"
            onChangeText={setDateOfBirth}
            placeholder="YYYY-MM-DD"
            value={dateOfBirth}
          />
          <Text style={[styles.meta, { color: palette.mutedForeground }]}>
            {isDateOfBirthLocked
              ? t(
                  "profile.dob.locked_helper",
                  "To correct your date of birth, contact support."
                )
              : t(
                  "profile.dob.editable_helper",
                  "You can set your date of birth once."
                )}
          </Text>
          <Button loading={isProfileSaving} onPress={handleSaveProfile}>
            Save changes
          </Button>
          {profileStatus ? (
            <Text
              style={[
                styles.meta,
                {
                  color:
                    profileStatus.type === "error"
                      ? palette.destructive
                      : palette.success,
                },
              ]}
            >
              {profileStatus.message}
            </Text>
          ) : null}
        </Card>

        <Card>
          <Text style={[styles.sectionTitle, { color: palette.foreground }]}>
            Account email
          </Text>
          <Text style={[styles.meta, { color: palette.mutedForeground }]}>
            To change your login email, please contact support.
          </Text>
          <TextField editable={false} label="Email" value={email} />
        </Card>

        <Card>
          <Text style={[styles.sectionTitle, { color: palette.foreground }]}>
            Update password
          </Text>
          <Text style={[styles.meta, { color: palette.mutedForeground }]}>
            Password must be at least 8 characters long.
          </Text>
          <TextField
            label="New password"
            onChangeText={setPassword}
            secureTextEntry
            value={password}
          />
          <TextField
            label="Confirm password"
            onChangeText={setConfirmPassword}
            secureTextEntry
            value={confirmPassword}
          />
          <Button
            disabled={!password || !confirmPassword}
            loading={isPasswordSaving}
            onPress={handleSavePassword}
          >
            Save password
          </Button>
          {passwordStatus ? (
            <Text
              style={[
                styles.meta,
                {
                  color:
                    passwordStatus.type === "error"
                      ? palette.destructive
                      : palette.success,
                },
              ]}
            >
              {passwordStatus.message}
            </Text>
          ) : null}
        </Card>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[2],
    paddingBottom: spacing[8],
  },
  content: {
    gap: spacing[4],
  },
  sectionTitle: {
    fontSize: typography.subtitle,
    fontWeight: "700",
  },
  avatarRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatar: {
    width: 112,
    height: 112,
    borderRadius: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  initial: {
    color: "#fff",
    fontSize: 32,
    fontWeight: "800",
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing[2],
  },
  buttonContent: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing[2],
    justifyContent: "center",
  },
  inlineStatusRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing[2],
  },
  buttonText: {
    fontSize: typography.body,
    fontWeight: "600",
  },
  meta: {
    fontSize: typography.small,
    lineHeight: 20,
  },
});
