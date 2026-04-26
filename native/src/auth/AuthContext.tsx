import AsyncStorage from "@react-native-async-storage/async-storage";
import * as WebBrowser from "expo-web-browser";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Platform } from "react-native";
import {
  API_BASE_URL,
  api,
  clearServerCookies,
  loginWithCredentials,
  loginWithMobileToken,
  signOut,
} from "@/api/client";
import type { BootstrapPayload, SessionPayload } from "@/api/types";

WebBrowser.maybeCompleteAuthSession();

type AuthContextValue = {
  authPendingMessage: string | null;
  authPendingProvider: "email" | "google" | null;
  bootstrap: BootstrapPayload | null;
  changeLanguage: (code: string) => Promise<void>;
  error: string | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
  session: SessionPayload;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const API_BASE_URL_STORAGE_KEY = "khasigpt:native:api-base-url";
const LANGUAGE_STORAGE_KEY = "khasigpt:native:language";

async function syncLanguageCookie(languageCode: string | null | undefined) {
  const normalized = languageCode?.trim().toLowerCase();
  if (!normalized || Platform.OS === "web") {
    return;
  }

  const cookieModule = require("@react-native-cookies/cookies");
  const CookieManager = (cookieModule.default ?? cookieModule) as {
    set: (
      url: string,
      cookie: {
        expires?: string;
        name: string;
        path?: string;
        value: string;
        version?: string;
      }
    ) => Promise<boolean>;
  };

  await CookieManager.set(API_BASE_URL, {
    expires: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    name: "lang",
    path: "/",
    value: normalized,
    version: "1",
  }).catch(() => undefined);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authPendingMessage, setAuthPendingMessage] = useState<string | null>(null);
  const [authPendingProvider, setAuthPendingProvider] = useState<
    "email" | "google" | null
  >(null);
  const [bootstrap, setBootstrap] = useState<BootstrapPayload | null>(null);
  const [session, setSession] = useState<SessionPayload>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const readStoredLanguage = useCallback(
    () => AsyncStorage.getItem(LANGUAGE_STORAGE_KEY).catch(() => null),
    []
  );

  const applyBootstrap = useCallback(async (payload: BootstrapPayload) => {
    await syncLanguageCookie(payload.i18n.activeLanguage.code);
    setBootstrap(payload);
    setSession(payload.session);
  }, []);

  const hydrateAuthenticatedState = useCallback(
    async (storedLanguage?: string | null) => {
      const sessionPromise = api.session().then((nextSession) => {
        setSession(nextSession);
        setBootstrap((current) =>
          current ? { ...current, session: nextSession } : current
        );
        return nextSession;
      });
      const payload = await api.bootstrap(storedLanguage);
      await applyBootstrap(payload);
      await sessionPromise.catch(() => undefined);
    },
    [applyBootstrap]
  );

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (Platform.OS !== "web") {
        const previousApiBaseUrl = await AsyncStorage.getItem(
          API_BASE_URL_STORAGE_KEY
        ).catch(() => null);
        if (
          typeof previousApiBaseUrl === "string" &&
          previousApiBaseUrl.trim().length > 0 &&
          previousApiBaseUrl !== API_BASE_URL
        ) {
          await clearServerCookies();
          setBootstrap(null);
          setSession(null);
        }
        await AsyncStorage.setItem(API_BASE_URL_STORAGE_KEY, API_BASE_URL).catch(
          () => undefined
        );
      }

      const storedLanguage = await readStoredLanguage();
      const payload = await api.bootstrap(storedLanguage);
      await applyBootstrap(payload);
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Unable to connect to KhasiGPT.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [applyBootstrap, readStoredLanguage]);

  useEffect(() => {
    refresh().catch(() => undefined);
  }, [refresh]);

  const signInWithEmail = useCallback(
    async (email: string, password: string) => {
      setIsLoading(true);
      setError(null);
      setAuthPendingProvider("email");
      setAuthPendingMessage("Signing you in...");
      try {
        const storedLanguage = await readStoredLanguage();
        await loginWithCredentials(email, password);
        setAuthPendingMessage("Loading your account...");
        await hydrateAuthenticatedState(storedLanguage);
      } catch (requestError) {
        const message =
          requestError instanceof Error
            ? requestError.message
            : "Unable to sign in.";
        setError(message);
      } finally {
        setAuthPendingMessage(null);
        setAuthPendingProvider(null);
        setIsLoading(false);
      }
    },
    [hydrateAuthenticatedState, readStoredLanguage]
  );

  const changeLanguage = useCallback(async (code: string) => {
    const normalized = code.trim().toLowerCase();
    if (!normalized) {
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, normalized).catch(
        () => undefined
      );
      const payload = await api.bootstrap(normalized);
      await syncLanguageCookie(payload.i18n.activeLanguage.code);
      setBootstrap(payload);
      setSession(payload.session);
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Unable to update language.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setAuthPendingProvider("google");
    setAuthPendingMessage("Opening Google...");
    try {
      const storedLanguage = await readStoredLanguage();
      const oauthBaseUrl = API_BASE_URL.replace("127.0.0.1", "localhost");

      if (Platform.OS === "web") {
        const browserOrigin =
          typeof window !== "undefined" ? window.location.origin : oauthBaseUrl;
        const isLocalBrowser =
          browserOrigin.includes("localhost") || browserOrigin.includes("127.0.0.1");
        const webAuthBaseUrl = isLocalBrowser ? "http://localhost:3000" : oauthBaseUrl;
        const callbackUrl = isLocalBrowser
          ? `${browserOrigin}/chat`
          : `${webAuthBaseUrl}/chat`;
        if (typeof window !== "undefined") {
          window.location.assign(
            `${webAuthBaseUrl}/api/auth/signin/google?callbackUrl=${encodeURIComponent(
              callbackUrl
            )}`
          );
        }
        return;
      }

      const redirectUrl = "khasigpt://oauth-complete";
      const result = await WebBrowser.openAuthSessionAsync(
        `${oauthBaseUrl}/api/mobile/auth/google-start`,
        redirectUrl
      );

      if (result.type !== "success" || !result.url) {
        return;
      }

      const parsed = new URL(result.url);
      const token = parsed.searchParams.get("token");
      const error = parsed.searchParams.get("error");
      if (error || !token) {
        throw new Error("Google sign in was not completed.");
      }

      setAuthPendingMessage("Signing you in...");
      await loginWithMobileToken(token);
      setAuthPendingMessage("Loading your account...");
      await hydrateAuthenticatedState(storedLanguage);
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Unable to complete Google sign in.";
      setError(message);
      throw requestError;
    } finally {
      setAuthPendingMessage(null);
      setAuthPendingProvider(null);
      setIsLoading(false);
    }
  }, [hydrateAuthenticatedState, readStoredLanguage]);

  const signOutUser = useCallback(async () => {
    setIsLoading(true);
    try {
      await signOut();
      setSession(null);
      await refresh();
    } finally {
      setIsLoading(false);
    }
  }, [refresh]);

  const value = useMemo(
    () => ({
      authPendingMessage,
      authPendingProvider,
      bootstrap,
      changeLanguage,
      error,
      isLoading,
      refresh,
      session,
      signInWithEmail,
      signInWithGoogle,
      signOutUser,
    }),
    [
      authPendingMessage,
      authPendingProvider,
      bootstrap,
      changeLanguage,
      error,
      isLoading,
      refresh,
      session,
      signInWithEmail,
      signInWithGoogle,
      signOutUser,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
