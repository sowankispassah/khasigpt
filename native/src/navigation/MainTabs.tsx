import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import {
  Bot,
  BriefcaseBusiness,
  Calculator,
  CircleHelp,
  Languages,
  MessageSquareText,
  ReceiptIndianRupee,
  UserRound,
} from "lucide-react-native";
import { useAuth } from "@/auth/AuthContext";
import { ChatScreen } from "@/screens/ChatScreen";
import { CalculatorScreen } from "@/screens/CalculatorScreen";
import { JobsScreen } from "@/screens/JobsScreen";
import { ProfileScreen } from "@/screens/ProfileScreen";
import { TranslateScreen } from "@/screens/TranslateScreen";
import { createWebRouteScreen } from "@/screens/WebRouteScreen";
import { useAppTheme } from "@/theme/useAppTheme";
import type { MainTabParamList } from "./types";

const Tab = createBottomTabNavigator<MainTabParamList>();
const StudyWebScreen = createWebRouteScreen("/chat?mode=study", "Study", "Study");
const SubscriptionsWebScreen = createWebRouteScreen(
  "/subscriptions",
  "Manage Subscriptions",
  "Subscriptions"
);
const RechargeWebScreen = createWebRouteScreen("/recharge", "Upgrade Plan", "Recharge");
const ForumWebScreen = createWebRouteScreen("/forum", "Community Forum", "Forum");
const AboutWebScreen = createWebRouteScreen("/about", "About Us", "About");
const ContactWebScreen = createWebRouteScreen("/about#contact", "Contact Us", "Contact");
const PrivacyPolicyWebScreen = createWebRouteScreen(
  "/privacy-policy",
  "Privacy Policy",
  "PrivacyPolicy"
);
const TermsOfServiceWebScreen = createWebRouteScreen(
  "/terms-of-service",
  "Terms of Service",
  "TermsOfService"
);

function iconFor(routeName: keyof MainTabParamList, color: string, size: number) {
  const props = { color, size, strokeWidth: 1.8 };
  switch (routeName) {
    case "Chat":
      return <Bot {...props} />;
    case "Translate":
      return <Languages {...props} />;
    case "Jobs":
      return <BriefcaseBusiness {...props} />;
    case "Study":
      return <MessageSquareText {...props} />;
    case "Calculator":
      return <Calculator {...props} />;
    case "Subscriptions":
    case "Recharge":
      return <ReceiptIndianRupee {...props} />;
    case "Profile":
      return <UserRound {...props} />;
    case "About":
    case "Contact":
    case "PrivacyPolicy":
    case "TermsOfService":
      return <CircleHelp {...props} />;
    default:
      return <MessageSquareText {...props} />;
  }
}

export function MainTabs() {
  const { palette } = useAppTheme();
  const { bootstrap } = useAuth();
  const featureAccess = bootstrap?.featureAccess;

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: palette.foreground,
        tabBarInactiveTintColor: palette.mutedForeground,
        tabBarStyle: {
          backgroundColor: palette.background,
          borderTopColor: palette.border,
          display: "none",
        },
        tabBarIcon: ({ color, size }) =>
          iconFor(route.name as keyof MainTabParamList, color, size),
      })}
    >
      <Tab.Screen component={ChatScreen} name="Chat" />
      {featureAccess?.translate ? (
        <Tab.Screen component={TranslateScreen} name="Translate" />
      ) : null}
      {featureAccess?.jobs ? <Tab.Screen component={JobsScreen} name="Jobs" /> : null}
      {featureAccess?.study ? (
        <Tab.Screen component={StudyWebScreen} name="Study" />
      ) : null}
      {featureAccess?.calculator ? (
        <Tab.Screen component={CalculatorScreen} name="Calculator" />
      ) : null}
      {featureAccess?.forum ? (
        <Tab.Screen component={ForumWebScreen} name="Forum" />
      ) : null}
      <Tab.Screen component={SubscriptionsWebScreen} name="Subscriptions" />
      <Tab.Screen component={RechargeWebScreen} name="Recharge" />
      <Tab.Screen component={ProfileScreen} name="Profile" />
      <Tab.Screen component={AboutWebScreen} name="About" />
      <Tab.Screen component={ContactWebScreen} name="Contact" />
      <Tab.Screen component={PrivacyPolicyWebScreen} name="PrivacyPolicy" />
      <Tab.Screen component={TermsOfServiceWebScreen} name="TermsOfService" />
    </Tab.Navigator>
  );
}
