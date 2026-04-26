import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Mail } from "lucide-react-native";
import { useState } from "react";
import { Image, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { api } from "@/api/client";
import { Button } from "@/components/Button";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import type { AuthStackParamList } from "@/navigation/types";
import { radius, spacing, typography } from "@/theme/tokens";
import { useAppTheme } from "@/theme/useAppTheme";

type Props = NativeStackScreenProps<AuthStackParamList, "Register">;

export function RegisterScreen({ navigation }: Props) {
  const { palette } = useAppTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [showEmailFields, setShowEmailFields] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async () => {
    setIsSubmitting(true);
    setStatus(null);
    try {
      const result = await api.register({
        email: email.trim(),
        password,
        acceptTerms,
      });
      setStatus(
        result.status === "verification_sent"
          ? `We sent a verification email to ${email.trim()}.`
          : result.status
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Registration failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

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
            Sign Up To KhasiGPT
          </Text>
        </View>

        {!showEmailFields ? (
          <Button onPress={() => setShowEmailFields(true)} variant="outline">
            <Mail color={palette.foreground} size={18} />
            <Text style={{ color: palette.foreground, fontWeight: "600" }}>
              Sign up with Email
            </Text>
          </Button>
        ) : (
          <View style={styles.form}>
            <TextField
              autoCapitalize="none"
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
            <View
              style={[
                styles.terms,
                { backgroundColor: palette.muted, borderColor: palette.input },
              ]}
            >
              <Switch onValueChange={setAcceptTerms} value={acceptTerms} />
              <Text style={[styles.termsText, { color: palette.foreground }]}>
                I agree to the Terms of Service and Privacy Policy.
              </Text>
            </View>
            <Button
              disabled={!email.trim() || password.length < 6 || !acceptTerms}
              loading={isSubmitting}
              onPress={submit}
            >
              Sign Up
            </Button>
            {status ? (
              <Text style={[styles.status, { color: palette.mutedForeground }]}>
                {status}
              </Text>
            ) : null}
          </View>
        )}

        <Pressable onPress={() => navigation.navigate("Login")}>
          <Text style={[styles.footer, { color: palette.mutedForeground }]}>
            Already have an account?{" "}
            <Text style={[styles.strongLink, { color: palette.foreground }]}>
              Sign in
            </Text>{" "}
            instead.
          </Text>
        </Pressable>
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
  form: {
    gap: spacing[4],
  },
  terms: {
    borderWidth: 1,
    borderRadius: radius.md,
    flexDirection: "row",
    gap: spacing[3],
    padding: spacing[3],
    alignItems: "center",
  },
  termsText: {
    flex: 1,
    fontSize: typography.small,
  },
  status: {
    fontSize: typography.small,
    textAlign: "center",
  },
  footer: {
    textAlign: "center",
    fontSize: typography.small,
  },
  strongLink: {
    fontWeight: "700",
  },
});
