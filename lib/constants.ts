export const isProductionEnvironment = process.env.NODE_ENV === "production";
export const isDevelopmentEnvironment = process.env.NODE_ENV === "development";
export const isTestEnvironment = Boolean(
  process.env.PLAYWRIGHT_TEST_BASE_URL ||
    process.env.PLAYWRIGHT ||
    process.env.CI_PLAYWRIGHT
);

// Bcrypt hash for the string "dummy-password" with cost factor 10.
export const DUMMY_PASSWORD =
  "$2b$10$CwTycUXWue0Thq9StjUM0uJ8/fy2s9kuNJP1s6FHX5eNUsiV6iKa2";

export const TOKENS_PER_CREDIT = 100;
export const DEFAULT_FREE_MESSAGES_PER_DAY = 3;
export const FREE_MESSAGE_SETTINGS_KEY = "chat.freeMessages";
export const FORUM_FEATURE_FLAG_KEY = "forum.enabled";

export const DEFAULT_SUGGESTED_PROMPTS = [
  "What are the advantages of using Next.js?",
  "Write code to demonstrate Dijkstra's algorithm",
  "Help me write an essay about Silicon Valley",
  "What is the weather in San Francisco?",
];

export const RECOMMENDED_PRICING_PLAN_SETTING_KEY = "billing.recommendedPlanId";
export const CUSTOM_KNOWLEDGE_ENABLED_SETTING_KEY = "chat.customKnowledge";
export const RAG_TIMEOUT_MS_SETTING_KEY = "chat.ragTimeoutMs";
export const RAG_MATCH_THRESHOLD_SETTING_KEY = "chat.ragMatchThreshold";
export const DEFAULT_RAG_TIMEOUT_MS = 5000;

export const DEFAULT_PRIVACY_POLICY = `
Khasigpt is committed to safeguarding your privacy. This Privacy Policy explains what information we collect, how we use it, and the choices you have regarding your personal data.

## Information We Collect
- Account details (such as your email address and profile information)
- Content you submit (messages, documents, and uploads)
- Usage data that helps us operate, secure, and improve the service

## How We Use Information
We use the information we collect to deliver and maintain Khasigpt, authenticate users, provide support, improve AI responses, and communicate important updates. We do not sell personal information to third parties.

## Data Sharing and Retention
We may share data with trusted service providers that help us host infrastructure, send emails, process payments, or perform analytics. These partners follow our instructions and are bound by confidentiality obligations. We retain personal data only for as long as needed to fulfill the purposes described here or as required by law.

## Your Choices
You can access and update your profile information from your account settings. To export or delete your data, contact us through the in-app support channels and we will respond within a reasonable timeframe.

## Contact
If you have questions about this policy, reach our privacy team at support@khasigpt.com.
`.trim();

export const DEFAULT_TERMS_OF_SERVICE = `
These Terms of Service (“Terms”) govern your access to and use of Khasigpt. By creating an account or using the platform you agree to these Terms.

## Account Responsibilities
You are responsible for maintaining the confidentiality of your account credentials and for all activity that occurs under your account. Notify us immediately of unauthorized use.

## Acceptable Use
You agree not to use Khasigpt for unlawful purposes, to distribute harmful or infringing content, or to interfere with the operation of the service. We may suspend or terminate access for violations.

## Intellectual Property
Khasigpt retains ownership of the platform, including software, documentation, and branding. You retain ownership of the content you create, but grant us a limited license to host and process it as required to provide the service.

## Disclaimers
The service is provided “as is” without warranties of any kind. We do not guarantee uninterrupted or error-free operation. To the fullest extent permitted by law, Khasigpt is not liable for damages arising from your use of the platform.

## Changes
We may update these Terms from time to time. Material changes will be announced through the app or via email. Continuing to use Khasigpt after changes become effective constitutes acceptance of the revised Terms.

## Contact
For questions about these Terms, email support@khasigpt.com.
`.trim();

export const DEFAULT_ABOUT_US = `
KhasiGPT is crafted by the Khasi Digital Collective to bring reliable AI assistance to Khasi speakers. Use this space to highlight your story, partnerships, or mission. Update the content from the Admin Settings panel whenever your team has news to share.
`.trim();
