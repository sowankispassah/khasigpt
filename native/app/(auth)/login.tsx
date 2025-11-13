import { Link, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import Constants from "expo-constants";
import { useState } from "react";
import { Image, Text, View } from "react-native";

import { PersistentUserMenu } from "@/components/user-menu";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Screen } from "@/components/screen";
import { useAuth } from "@/providers/auth-provider";
import { useTheme } from "@/theme";

const logo = require("../../assets/images/icon.png");
const WEB_BASE_URL =
  (Constants.expoConfig?.extra as Record<string, string> | undefined)
    ?.webBaseUrl ?? "https://khasigpt.com";

export default function LoginScreen() {
  const { login, status } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      setError("Enter your email and password.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await login({ email, password });
      router.replace("/(tabs)");
    } catch (err) {
      console.error(err);
      setError("Sign in failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleForgotPassword = async () => {
    const url = `${WEB_BASE_URL}/forgot-password`;
    await WebBrowser.openBrowserAsync(url);
  };

  const handleGoogleSignIn = async () => {
    const callbackUrl = encodeURIComponent(`${WEB_BASE_URL}/`);
    const url = `${WEB_BASE_URL}/api/auth/signin/google?callbackUrl=${callbackUrl}`;
    await WebBrowser.openBrowserAsync(url);
  };

  return (
    <Screen scrollable>
      <View style={{ flex: 1, gap: 24, paddingTop: 12 }}>
        <View style={{ alignItems: "flex-end" }}>
          <PersistentUserMenu />
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Card elevated>
          <View style={{ alignItems: "center", gap: 8 }}>
            <Image source={logo} style={{ width: 48, height: 48, borderRadius: 12 }} />
            <Text style={{ fontFamily: "GeistSemiBold", fontSize: 20, color: colors.foreground }}>
              Sign in to KhasiGPT
            </Text>
            <Text
              style={{
                fontFamily: "Geist",
                fontSize: 14,
                textAlign: "center",
                color: colors.mutedForeground,
              }}
            >
              KhasiGPT is your Khasi-first AI assistant for translation, writing, and research.
            </Text>
          </View>

          <View style={{ marginTop: 24, gap: 12 }}>
            <Button label="Continue with Google" variant="outline" onPress={handleGoogleSignIn} />
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                marginVertical: 8,
              }}
            >
              <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
              <Text style={{ color: colors.mutedForeground, fontFamily: "Geist", fontSize: 12 }}>
                or email
              </Text>
              <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
            </View>
            {error ? (
              <Text
                style={{
                  backgroundColor: `${colors.destructive}15`,
                  borderColor: colors.destructive,
                  borderWidth: 1,
                  color: colors.destructive,
                  padding: 8,
                  borderRadius: 12,
                  fontFamily: "Geist",
                  fontSize: 13,
                }}
              >
                {error}
              </Text>
            ) : null}
            <Input
              label="Email address"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
            />
            <Input
              label="Password"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
            />
            <Button
              label={busy ? "Signing in..." : "Sign in"}
              onPress={handleLogin}
              disabled={busy || status === "loading"}
            />
            <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
              <Text
                onPress={handleForgotPassword}
                style={{
                  color: colors.mutedForeground,
                  textDecorationLine: "underline",
                  fontSize: 13,
                  fontFamily: "GeistMedium",
                }}
              >
                Forgot password?
              </Text>
            </View>
          </View>

          <View
            style={{
              marginTop: 16,
              flexDirection: "row",
              justifyContent: "center",
              gap: 4,
            }}
          >
            <Text style={{ color: colors.mutedForeground, fontFamily: "Geist" }}>
              Need an account?
            </Text>
            <Text
              style={{ color: colors.primary, fontFamily: "GeistSemiBold" }}
              onPress={() => WebBrowser.openBrowserAsync(`${WEB_BASE_URL}/register`)}
            >
              Sign up on web
            </Text>
          </View>
        </Card>
        </View>
        <Link href="/" style={{ color: colors.mutedForeground, fontFamily: "Geist", textAlign: "center" }}>
          Back to app
        </Link>
      </View>
    </Screen>
  );
}
