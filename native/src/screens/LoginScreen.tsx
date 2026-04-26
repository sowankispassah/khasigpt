import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Mail } from "lucide-react-native";
import { useCallback, useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/Button";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import type { AuthStackParamList } from "@/navigation/types";
import { spacing, typography } from "@/theme/tokens";
import { useAppTheme } from "@/theme/useAppTheme";

type Props = NativeStackScreenProps<AuthStackParamList, "Login">;

function GoogleIcon({ size = 18 }: { size?: number }) {
  return (
    <Svg height={size} viewBox="0 0 24 24" width={size}>
      <Path
        d="M21.805 12.23c0-.68-.061-1.333-.175-1.96H12v3.707h5.498a4.7 4.7 0 0 1-2.039 3.084v2.56h3.306c1.935-1.782 3.04-4.41 3.04-7.39Z"
        fill="#4285F4"
      />
      <Path
        d="M12 22c2.76 0 5.074-.915 6.765-2.379l-3.306-2.56c-.915.613-2.084.975-3.459.975-2.653 0-4.9-1.79-5.703-4.195H2.88v2.644A10.212 10.212 0 0 0 12 22Z"
        fill="#34A853"
      />
      <Path
        d="M6.297 13.84A6.14 6.14 0 0 1 5.978 12c0-.64.11-1.26.319-1.84V7.516H2.88A10.212 10.212 0 0 0 1.75 12c0 1.653.396 3.218 1.13 4.484l3.417-2.644Z"
        fill="#FBBC04"
      />
      <Path
        d="M12 5.964c1.5 0 2.846.516 3.906 1.53l2.93-2.93C17.07 2.92 14.755 2 12 2 7.88 2 4.322 4.361 2.88 7.516l3.417 2.644C7.1 7.755 9.347 5.964 12 5.964Z"
        fill="#EA4335"
      />
    </Svg>
  );
}

export function LoginScreen({ navigation }: Props) {
  const {
    authPendingMessage,
    authPendingProvider,
    error,
    signInWithEmail,
    signInWithGoogle,
  } = useAuth();
  const { palette } = useAppTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showEmailFields, setShowEmailFields] = useState(false);
  const isAuthenticating = Boolean(authPendingProvider);
  const isEmailSubmitting = authPendingProvider === "email";
  const isGoogleSubmitting = authPendingProvider === "google";

  const submit = useCallback(async () => {
    await signInWithEmail(email.trim(), password);
  }, [email, password, signInWithEmail]);

  const continueWithGoogle = useCallback(async () => {
    try {
      await signInWithGoogle();
    } catch {
      // Error state is surfaced by the auth context.
    }
  }, [signInWithGoogle]);

  return (
    <Screen>
      <View style={styles.wrap}>
        <View style={styles.header}>
          <Text style={[styles.subtitle, { color: palette.mutedForeground }]}>
            KhasiGPT is your smart AI assistant designed to understand and speak
            Khasi language.
          </Text>
          <Image
            resizeMode="contain"
            source={require("../../assets/khasigptlogo.png")}
            style={styles.logo}
          />
          <Text style={[styles.title, { color: palette.foreground }]}>
            Sign In To KhasiGPT
          </Text>
          {error ? (
            <Text
              accessibilityRole="alert"
              style={[
                styles.error,
                {
                  backgroundColor: palette.destructiveMuted,
                  borderColor: palette.destructive,
                  color: palette.destructive,
                },
              ]}
            >
              {error}
            </Text>
          ) : null}
        </View>

        <Button
          loading={isGoogleSubmitting}
          loadingText={
            authPendingProvider === "google" && authPendingMessage
              ? authPendingMessage
              : "Signing you in..."
          }
          onPress={continueWithGoogle}
          style={styles.authOptionButton}
          variant="outline"
        >
          <View style={styles.authOptionContent}>
            <GoogleIcon size={18} />
            <Text style={[styles.authOptionText, { color: palette.foreground }]}>
              Login with Google
            </Text>
          </View>
        </Button>

        {!showEmailFields ? (
          <Button
            disabled={isAuthenticating}
            onPress={() => setShowEmailFields(true)}
            style={styles.authOptionButton}
            variant="outline"
          >
            <View style={styles.authOptionContent}>
              <Mail color={palette.foreground} size={18} />
              <Text style={[styles.authOptionText, { color: palette.foreground }]}>
                Login with Email
              </Text>
            </View>
          </Button>
        ) : (
          <View style={styles.form}>
            <TextField
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              label="Email Address"
              onChangeText={setEmail}
              placeholder="Your Email Address"
              value={email}
            />
            <TextField
              label="Password"
              onChangeText={setPassword}
              secureTextEntry
              value={password}
            />
            <Button
              disabled={!email.trim() || password.length < 6}
              loading={isEmailSubmitting}
              loadingText={
                authPendingProvider === "email" && authPendingMessage
                  ? authPendingMessage
                  : "Signing you in..."
              }
              onPress={submit}
            >
              Sign in
            </Button>
            <Pressable
              disabled={isAuthenticating}
              onPress={() => navigation.navigate("ForgotPassword")}
            >
              <Text
                style={[styles.textLink, { color: palette.mutedForeground }]}
              >
                Forgot password?
              </Text>
            </Pressable>
          </View>
        )}

        <Text style={[styles.footer, { color: palette.mutedForeground }]}>
          Don't have an account?{" "}
          <Text
            onPress={() => {
              if (!isAuthenticating) {
                navigation.navigate("Register");
              }
            }}
            style={[styles.strongLink, { color: palette.foreground }]}
          >
            Sign up
          </Text>{" "}
          for free.
        </Text>

        {isAuthenticating ? (
          <View
            pointerEvents="auto"
            style={[
              styles.pendingOverlay,
              {
                backgroundColor: palette.background,
                borderColor: palette.input,
              },
            ]}
          >
            <ActivityIndicator color={palette.foreground} size="small" />
            <Text style={[styles.pendingTitle, { color: palette.foreground }]}>
              {authPendingProvider === "google"
                ? "Completing Google sign in"
                : "Signing you in"}
            </Text>
            <Text
              style={[styles.pendingBody, { color: palette.mutedForeground }]}
            >
              {authPendingMessage ?? "Loading your account..."}
            </Text>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
    justifyContent: "center",
    flex: 1,
    gap: spacing[4],
    position: "relative",
  },
  header: {
    alignItems: "center",
    gap: spacing[2],
    paddingHorizontal: spacing[4],
  },
  subtitle: {
    textAlign: "center",
    fontSize: typography.small,
    lineHeight: 19,
  },
  logo: {
    height: 32,
    width: 170,
    marginTop: spacing[3],
  },
  title: {
    fontSize: typography.subtitle,
    fontWeight: "700",
  },
  error: {
    width: "100%",
    borderWidth: 1,
    borderRadius: 6,
    padding: spacing[3],
    fontSize: typography.small,
  },
  authOptionButton: {
    width: "100%",
  },
  authOptionContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[2],
  },
  authOptionText: {
    fontSize: typography.body,
    fontWeight: "600",
  },
  form: {
    gap: spacing[4],
  },
  textLink: {
    textAlign: "right",
    textDecorationLine: "underline",
    fontSize: typography.small,
  },
  footer: {
    textAlign: "center",
    fontSize: typography.small,
  },
  strongLink: {
    fontWeight: "700",
  },
  pendingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[2],
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: spacing[6],
  },
  pendingTitle: {
    fontSize: typography.subtitle,
    fontWeight: "700",
    textAlign: "center",
  },
  pendingBody: {
    fontSize: typography.body,
    lineHeight: 22,
    textAlign: "center",
  },
});
