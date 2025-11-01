import type { TranslationDefinition } from "./dictionary";

export const STATIC_TRANSLATION_DEFINITIONS: TranslationDefinition[] = [
  {
    key: "greeting.title",
    defaultText: "Hello there!",
    description: "Greeting headline above the chat input.",
  },
  {
    key: "greeting.subtitle",
    defaultText: "How can I help you today?",
    description: "Secondary greeting line beneath the hero title.",
  },
  {
    key: "user_menu.resources",
    defaultText: "Resources",
    description: "Dropdown label for the resources submenu.",
  },
  {
    key: "user_menu.language",
    defaultText: "Language",
    description: "Dropdown label for language selection submenu.",
  },
  {
    key: "user_menu.language.active",
    defaultText: "Active",
    description: "Chip label indicating the currently selected language.",
  },
  {
    key: "user_menu.language.updating",
    defaultText: "Updating…",
    description: "Helper text shown while a new language is being applied.",
  },
  {
    key: "user_menu.theme.light",
    defaultText: "Light mode",
    description: "Menu action to switch to light theme.",
  },
  {
    key: "user_menu.theme.dark",
    defaultText: "Dark mode",
    description: "Menu action to switch to dark theme.",
  },
  {
    key: "user_menu.sign_out",
    defaultText: "Sign out",
    description: "Menu action to sign out of the application.",
  },
  {
    key: "user_menu.manage_subscriptions",
    defaultText: "Manage Subscriptions",
    description: "Menu item leading to subscriptions management.",
  },
  {
    key: "user_menu.manage_subscriptions_status_checking",
    defaultText: "Checking plan...",
    description: "Helper text while subscription plan is loading.",
  },
  {
    key: "user_menu.manage_subscriptions_status_fallback",
    defaultText: "Free Plan",
    description: "Fallback label when plan information is unavailable.",
  },
  {
    key: "user_menu.upgrade_plan",
    defaultText: "Upgrade plan",
    description: "Menu item leading to plan upgrade page.",
  },
  {
    key: "user_menu.open_admin_console",
    defaultText: "Open admin console",
    description: "Menu item for admins to open admin dashboard.",
  },
  {
    key: "user_menu.profile",
    defaultText: "Profile",
    description: "Menu item linking to the user profile page.",
  },
  {
    key: "user_menu.loading",
    defaultText: "Loading user menu",
    description: "SR-only label shown while the menu state is loading.",
  },
  {
    key: "user_menu.open_menu",
    defaultText: "Open menu",
    description: "SR-only label for the unauthenticated menu button.",
  },
  {
    key: "user_menu.resources.about",
    defaultText: "About Us",
    description: "Link to the about page.",
  },
  {
    key: "user_menu.resources.contact",
    defaultText: "Contact Us",
    description: "Link to the contact section.",
  },
  {
    key: "user_menu.resources.privacy",
    defaultText: "Privacy Policy",
    description: "Link to privacy policy page.",
  },
  {
    key: "user_menu.resources.terms",
    defaultText: "Terms of Service",
    description: "Link to terms of service page.",
  },
  {
    key: "navigation.back_to_home",
    defaultText: "Back to home",
    description: "Text for links that return to the home page.",
  },
  {
    key: "about.title",
    defaultText: "About KhasiGPT",
    description: "Page heading for the about page.",
  },
  {
    key: "about.subtitle",
    defaultText:
      "We build AI tools that understand Khasi culture, language, and the people who use them every day.",
    description: "Introductory paragraph on the about page.",
  },
  {
    key: "legal.privacy.title",
    defaultText: "Privacy Policy",
    description: "Heading for the privacy policy page.",
  },
  {
    key: "legal.terms.title",
    defaultText: "Terms of Service",
    description: "Heading for the terms of service page.",
  },
  {
    key: "legal.last_updated_prefix",
    defaultText: "Last updated",
    description: "Prefix used before the legal document last updated date.",
  },
  {
    key: "about.contact_heading",
    defaultText: "Contact the team",
    description: "Heading above the contact section on the about page.",
  },
  {
    key: "about.contact_caption",
    defaultText:
      "Share feedback, partnership ideas, or support questions. We usually reply within one working day.",
    description: "Caption text below the contact heading.",
  },
];
