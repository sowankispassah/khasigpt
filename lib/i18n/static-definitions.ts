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
    key: "common.cancel",
    defaultText: "Cancel",
    description: "Generic cancel action label.",
  },
  {
    key: "common.close",
    defaultText: "Close",
    description: "Generic close action label.",
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
      "We build AI assistance that understand Khasi culture, language, and the people who use them every day.",
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
    key: "auth.subtitle",
    defaultText:
      "KhasiGPT is your smart AI assistant designed to understand and speak Khasi language.",
    description: "Subtitle displayed on authentication pages.",
  },
  {
    key: "login.title",
    defaultText: "Sign In To KhasiGPT",
    description: "Heading for the login page.",
  },
  {
    key: "login.cta",
    defaultText: "Sign in",
    description: "Primary button label on the login page.",
  },
  {
    key: "login.forgot_password",
    defaultText: "Forgot password?",
    description: "Link copy for the forgot password action on the login page.",
  },
  {
    key: "login.signup_prompt_prefix",
    defaultText: "Don't have an account?",
    description: "Prefix text before the sign-up link on the login page.",
  },
  {
    key: "login.signup_prompt_link",
    defaultText: "Sign up",
    description: "Link text that navigates to the registration page.",
  },
  {
    key: "login.signup_prompt_suffix",
    defaultText: "for free.",
    description: "Suffix text following the sign-up link on the login page.",
  },
  {
    key: "login.continue_with_email",
    defaultText: "Continue with Email",
    description:
      "Button label used to reveal the email login form on the login page.",
  },
  {
    key: "login.error.invalid_credentials",
    defaultText: "Invalid credentials. Please try again.",
    description: "Error shown when the login credentials are incorrect.",
  },
  {
    key: "login.error.invalid_data",
    defaultText:
      "Your submission was invalid. Please check the form and retry.",
    description: "Error shown when the login form submission is invalid.",
  },
  {
    key: "login.error.inactive",
    defaultText:
      "This account is inactive due to not verified or previous deleted. Please contact support.",
    description: "Error shown when the user account is inactive.",
  },
  {
    key: "register.title",
    defaultText: "Sign Up To KhasiGPT",
    description: "Heading for the registration page.",
  },
  {
    key: "register.cta",
    defaultText: "Sign Up",
    description: "Primary button label on the registration page.",
  },
  {
    key: "register.continue_with_email",
    defaultText: "Sign up with Email",
    description:
      "Button label used to reveal the email registration form on the sign-up page.",
  },
  {
    key: "register.error.account_exists",
    defaultText: "Account already exists!",
    description: "Toast message when the email is already registered.",
  },
  {
    key: "register.error.failed",
    defaultText: "Failed to create account!",
    description: "Toast message when registration fails unexpectedly.",
  },
  {
    key: "register.error.invalid_data",
    defaultText: "Failed validating your submission!",
    description: "Toast message when registration validation fails.",
  },
  {
    key: "register.error.terms_unaccepted",
    defaultText:
      "You must accept the Terms of Service and Privacy Policy to continue.",
    description: "Toast message when the user has not accepted terms.",
  },
  {
    key: "register.success.verification_sent",
    defaultText:
      "We sent a verification email to {email}. Follow the link to activate your account.",
    description:
      "Message shown after registration when the verification email is sent.",
  },
  {
    key: "register.success.verification_confirmation",
    defaultText: "Check your email to verify your account.",
    description: "Toast message shown after the verification email is sent.",
  },
  {
    key: "register.terms_statement_prefix",
    defaultText: "I agree to the",
    description: "Prefix for the terms acceptance statement.",
  },
  {
    key: "register.terms_statement_and",
    defaultText: "and",
    description: "Connector text used in the terms acceptance statement.",
  },
  {
    key: "register.terms_statement_suffix",
    defaultText: ".",
    description: "Suffix appended to the terms acceptance statement.",
  },
  {
    key: "register.terms_terms",
    defaultText: "Terms of Service",
    description: "Link label for terms of service.",
  },
  {
    key: "register.terms_privacy",
    defaultText: "Privacy Policy",
    description: "Link label for privacy policy.",
  },
  {
    key: "register.login_prompt_prefix",
    defaultText: "Already have an account?",
    description: "Prefix text before the login link on the register page.",
  },
  {
    key: "register.login_prompt_link",
    defaultText: "Sign in",
    description: "Link text taking the user to the login page.",
  },
  {
    key: "register.login_prompt_suffix",
    defaultText: "instead.",
    description: "Suffix text after the login link on the register page.",
  },
  {
    key: "auth.email_label",
    defaultText: "Email Address",
    description: "Label for the email input on auth forms.",
  },
  {
    key: "auth.password_label",
    defaultText: "Password",
    description: "Label for the password input on auth forms.",
  },
  {
    key: "auth.email_placeholder",
    defaultText: "Your Email Address",
    description: "Placeholder text for the email input.",
  },
  {
    key: "auth.continue_with_google.login",
    defaultText: "Continue with Google",
    description: "Google button label on the login page.",
  },
  {
    key: "auth.continue_with_google.register",
    defaultText: "Sign up with Google",
    description: "Google button label on the registration page.",
  },
  {
    key: "visibility.private.label",
    defaultText: "Private",
    description: "Label for private chat visibility option.",
  },
  {
    key: "visibility.private.description",
    defaultText: "Only you can access this chat",
    description: "Description of private chat visibility.",
  },
  {
    key: "visibility.public.label",
    defaultText: "Public",
    description: "Label for public chat visibility option.",
  },
  {
    key: "visibility.public.description",
    defaultText: "Anyone with the link can access this chat",
    description: "Description of public chat visibility.",
  },
  {
    key: "chat.disclaimer.text",
    defaultText:
      "KhasiGPT or other AI Models can make mistakes. Check important details.",
    description: "Disclaimer text displayed below the composer.",
  },
  {
    key: "chat.disclaimer.privacy_link",
    defaultText: "See privacy policy.",
    description: "Link text for the privacy policy in the chat disclaimer.",
  },
  {
    key: "chat.recharge.alert.title",
    defaultText: "Credit top-up required",
    description: "Alert title shown when a user runs out of credits.",
  },
  {
    key: "chat.recharge.alert.description",
    defaultText:
      "You've used all of your free daily messages. Top up credits to keep chatting without interruptions.",
    description: "Alert description shown when a user runs out of credits.",
  },
  {
    key: "chat.recharge.alert.confirm",
    defaultText: "Go to recharge",
    description: "Button label leading to the recharge page from the alert.",
  },
  {
    key: "chat.gateway.alert.title",
    defaultText: "Activate AI Gateway",
    description: "Alert title shown when AI Gateway activation is required.",
  },
  {
    key: "chat.gateway.alert.description",
    defaultText:
      "This application requires {subject} to activate Vercel AI Gateway.",
    description:
      "Alert description explaining that AI Gateway must be activated.",
  },
  {
    key: "chat.gateway.alert.subject.owner",
    defaultText: "the owner",
    description: "Replacement text for the AI Gateway alert in production.",
  },
  {
    key: "chat.gateway.alert.subject.you",
    defaultText: "you",
    description: "Replacement text for the AI Gateway alert in development.",
  },
  {
    key: "chat.gateway.alert.confirm",
    defaultText: "Activate",
    description: "Button label to activate AI Gateway.",
  },
  {
    key: "chat.upload.error_generic",
    defaultText: "Failed to upload file, please try again!",
    description: "Generic error shown when file upload fails.",
  },
  {
    key: "chat.input.wait_for_response",
    defaultText: "Please wait for the model to finish its response!",
    description:
      "Error shown if the user tries to submit while the model is streaming.",
  },
  {
    key: "chat.deleted_notice",
    defaultText: "This chat has been deleted. You are viewing it in read-only mode.",
    description: "Banner text shown to admins when viewing a deleted chat.",
  },
  {
    key: "chat.input.placeholder",
    defaultText: "Send a message...",
    description: "Placeholder text for the main chat input.",
  },
  {
    key: "profile.title",
    defaultText: "Profile",
    description: "Heading for the profile page.",
  },
  {
    key: "profile.subtitle",
    defaultText: "Update your account information and security preferences.",
    description: "Subheading on the profile page.",
  },
  {
    key: "profile.picture.title",
    defaultText: "Profile picture",
    description: "Heading for the profile picture card.",
  },
  {
    key: "profile.picture.description",
    defaultText:
      "Upload an image to personalise your account. This picture appears in the chat header and menus.",
    description: "Description under the profile picture heading.",
  },
  {
    key: "profile.picture.size_help",
    defaultText: "PNG, JPG, or WEBP up to 2 MB.",
    description: "Footnote under the profile picture section.",
  },
  {
    key: "profile.picture.choose",
    defaultText: "Choose image",
    description: "Button label for opening the file picker.",
  },
  {
    key: "profile.picture.upload",
    defaultText: "Upload",
    description: "Button label when no file has been selected yet.",
  },
  {
    key: "profile.picture.save_changes",
    defaultText: "Save changes",
    description: "Button label when a file is ready to upload.",
  },
  {
    key: "profile.picture.saving",
    defaultText: "Saving...",
    description: "Button label while the avatar is uploading.",
  },
  {
    key: "profile.picture.remove",
    defaultText: "Remove",
    description: "Button label for removing a profile image.",
  },
  {
    key: "profile.picture.error.file_type",
    defaultText: "Please choose a PNG, JPG, or WEBP image.",
    description: "Error when an unsupported file type is selected.",
  },
  {
    key: "profile.picture.error.file_size",
    defaultText: "Images must be 2MB or smaller.",
    description: "Error when selected file is too large.",
  },
  {
    key: "profile.picture.error.choose_before_upload",
    defaultText: "Choose an image before uploading.",
    description: "Error shown when upload is attempted without a file.",
  },
  {
    key: "profile.picture.error.upload_generic",
    defaultText:
      "Failed to update profile image. Please try again.",
    description: "Generic error for failed uploads.",
  },
  {
    key: "profile.picture.error.unexpected",
    defaultText:
      "Unexpected error while uploading image. Please try again.",
    description: "Error when an unexpected upload issue occurs.",
  },
  {
    key: "profile.picture.error.remove_generic",
    defaultText:
      "Failed to remove profile image. Please try again.",
    description: "Generic error when removing the profile image fails.",
  },
  {
    key: "profile.picture.error.unexpected_remove",
    defaultText:
      "Unexpected error while removing image. Please try again.",
    description: "Unexpected error when removing the image.",
  },
  {
    key: "profile.picture.success.upload",
    defaultText: "Profile picture updated.",
    description: "Success message after uploading an image.",
  },
  {
    key: "profile.picture.success.remove",
    defaultText: "Profile picture removed.",
    description: "Success message after removing an image.",
  },
  {
    key: "profile.account_email.title",
    defaultText: "Account email",
    description: "Heading for the account email card.",
  },
  {
    key: "profile.account_email.description",
    defaultText: "To change your login email, please contact support.",
    description: "Description in the account email card.",
  },
  {
    key: "profile.account_email.link_text",
    defaultText: "subscriptions dashboard",
    description: "Link text inside the account email card.",
  },
  {
    key: "profile.account_email.link_prefix",
    defaultText: "Want to review your plan or credits? Visit the",
    description: "Prefix text before the subscriptions link.",
  },
  {
    key: "profile.account_email.link_suffix",
    defaultText: ".",
    description: "Suffix after the subscriptions link.",
  },
  {
    key: "profile.password.title",
    defaultText: "Update password",
    description: "Heading for the password form.",
  },
  {
    key: "profile.password.description",
    defaultText: "Password must be at least 8 characters long.",
    description: "Description under the password form heading.",
  },
  {
    key: "profile.password.new_label",
    defaultText: "New password",
    description: "Label for the new password field.",
  },
  {
    key: "profile.password.confirm_label",
    defaultText: "Confirm password",
    description: "Label for the confirm password field.",
  },
  {
    key: "profile.password.save_button",
    defaultText: "Save password",
    description: "Button text in the password form.",
  },
  {
    key: "profile.password.saving",
    defaultText: "Saving...",
    description: "Label shown while password form is submitting.",
  },
  {
    key: "profile.password.success",
    defaultText: "Password updated successfully.",
    description: "Success message after updating the password.",
  },
  {
    key: "profile.deactivate.title",
    defaultText: "Deactivate account",
    description: "Heading for the deactivate account section.",
  },
  {
    key: "profile.deactivate.description",
    defaultText:
      "This process cannot be undone. You can contact support for any further assistance.",
    description: "Description in the deactivate account section.",
  },
  {
    key: "profile.deactivate.button",
    defaultText: "Deactivate account",
    description: "Button label for deactivating the account.",
  },
  {
    key: "profile.deactivate.confirm_title",
    defaultText: "Are you sure?",
    description: "Confirm dialog title when deactivating account.",
  },
  {
    key: "profile.deactivate.confirm_description",
    defaultText: "Your account will be disabled and you will be signed out.",
    description: "Confirm dialog description when deactivating account.",
  },
  {
    key: "profile.deactivate.confirm_cancel",
    defaultText: "Cancel",
    description: "Cancel button label in the deactivate account dialog.",
  },
  {
    key: "profile.deactivate.confirm_action",
    defaultText: "Deactivate",
    description: "Confirm button label in the deactivate account dialog.",
  },
  {
    key: "profile.deactivate.confirm_action_pending",
    defaultText: "Deactivating...",
    description:
      "Loading state label shown while the deactivate action is submitting.",
  },
  {
    key: "sidebar.history.login_prompt",
    defaultText: "Login to save and revisit previous chats!",
    description: "Message shown when history is unavailable because the user is signed out.",
  },
  {
    key: "sidebar.history.empty",
    defaultText: "Your conversations will appear here once you start chatting!",
    description: "Placeholder when the user has no chat history.",
  },
  {
    key: "sidebar.history.section.today",
    defaultText: "Today",
    description: "Label for chats created today.",
  },
  {
    key: "sidebar.history.section.yesterday",
    defaultText: "Yesterday",
    description: "Label for chats created yesterday.",
  },
  {
    key: "sidebar.history.section.last_week",
    defaultText: "Last 7 days",
    description: "Label for chats created within the last week.",
  },
  {
    key: "sidebar.history.section.last_month",
    defaultText: "Last 30 days",
    description: "Label for chats created within the last month.",
  },
  {
    key: "sidebar.history.section.older",
    defaultText: "Older than last month",
    description: "Label for chats created more than a month ago.",
  },
  {
    key: "sidebar.history.toast.loading",
    defaultText: "Deleting chat...",
    description: "Toast message while a chat deletion is in progress.",
  },
  {
    key: "sidebar.history.toast.success",
    defaultText: "Chat deleted successfully",
    description: "Toast message when a chat has been deleted.",
  },
  {
    key: "sidebar.history.toast.error",
    defaultText: "Failed to delete chat",
    description: "Toast message when deleting a chat fails.",
  },
  {
    key: "sidebar.history.delete_dialog.title",
    defaultText: "Are you absolutely sure?",
    description: "Delete confirmation dialog title in chat history sidebar.",
  },
  {
    key: "sidebar.history.delete_dialog.description",
    defaultText:
      "This action cannot be undone. This will permanently delete your chat and remove it from our servers.",
    description: "Delete confirmation dialog description in chat history sidebar.",
  },
  {
    key: "sidebar.history.delete_dialog.confirm",
    defaultText: "Continue",
    description: "Confirmation button label in the delete dialog.",
  },
  {
    key: "sidebar.history.end",
    defaultText: "You have reached the end of your chat history.",
    description: "Message shown when no more chats are available to load.",
  },
  {
    key: "sidebar.history.loading",
    defaultText: "Loading Chats...",
    description: "Label shown while additional chats are loading.",
  },
  {
    key: "subscriptions.manage_profile",
    defaultText: "Manage profile",
    description: "Link text next to back to home on the subscriptions page.",
  },
  {
    key: "subscriptions.title",
    defaultText: "Subscriptions & Credits",
    description: "Heading for the subscriptions page.",
  },
  {
    key: "subscriptions.subtitle",
    defaultText: "Track your current plan, credit balance, and recent usage.",
    description: "Subheading for the subscriptions page.",
  },
  {
    key: "subscriptions.metric.total_used",
    defaultText: "Total credits used",
    description: "Metric label for total credits used.",
  },
  {
    key: "subscriptions.metric.remaining",
    defaultText: "Credits remaining",
    description: "Metric label for credits remaining.",
  },
  {
    key: "subscriptions.metric.allocated",
    defaultText: "Credits allocated",
    description: "Metric label for credits allocated.",
  },
  {
    key: "subscriptions.metric.plan_expires",
    defaultText: "Plan expires",
    description: "Metric label for plan expiry.",
  },
  {
    key: "subscriptions.plan_overview.title",
    defaultText: "Plan overview",
    description: "Heading for the plan overview card.",
  },
  {
    key: "subscriptions.plan_overview.current_plan",
    defaultText: "Current plan",
    description: "Row label in plan overview.",
  },
  {
    key: "subscriptions.plan_overview.free_credits",
    defaultText: "Free credits",
    description: "Row label for free credits.",
  },
  {
    key: "subscriptions.plan_overview.credits_remaining",
    defaultText: "Credits remaining",
    description: "Row label for credits remaining.",
  },
  {
    key: "subscriptions.plan_overview.credits_allocated",
    defaultText: "Credits allocated",
    description: "Row label for credits allocated.",
  },
  {
    key: "subscriptions.plan_overview.plan_expires",
    defaultText: "Plan expires",
    description: "Row label for plan expiry.",
  },
  {
    key: "subscriptions.plan_overview.days_remaining",
    defaultText: "({count} day{plural} left)",
    description: "Suffix showing days remaining for the current plan.",
  },
  {
    key: "subscriptions.plan_overview.no_plan",
    defaultText: "No plan yet",
    description: "Fallback label when user has no plan.",
  },
  {
    key: "subscriptions.plan_overview.no_active_plan",
    defaultText: "No active plan",
    description: "Fallback text when plan has no expiry.",
  },
  {
    key: "subscriptions.plan_overview.active_plan",
    defaultText: "Active plan",
    description: "Fallback label when a generic active plan name is needed.",
  },
  {
    key: "subscriptions.unit.credits",
    defaultText: "credits",
    description: "Generic credits unit label.",
  },
  {
    key: "subscriptions.quick_actions.title",
    defaultText: "Quick actions",
    description: "Heading for the quick actions card.",
  },
  {
    key: "subscriptions.quick_actions.recharge_prefix",
    defaultText: "Need more credits? Visit the",
    description: "Text shown before the recharge link.",
  },
  {
    key: "subscriptions.quick_actions.recharge_link",
    defaultText: "recharge page",
    description: "Recharge link text.",
  },
  {
    key: "subscriptions.quick_actions.support",
    defaultText:
      "Prefer emailed invoices or receipts? Contact support and we'll help out.",
    description: "Support message in quick actions card.",
  },
  {
    key: "subscriptions.daily_usage.title",
    defaultText: "Daily usage",
    description: "Heading for the daily usage chart.",
  },
  {
    key: "subscriptions.daily_usage.subtitle",
    defaultText: "Credits consumed per day.",
    description: "Subtitle for the daily usage chart.",
  },
  {
    key: "subscriptions.daily_usage.empty",
    defaultText: "No usage recorded in this range.",
    description: "Empty state text for the daily usage chart.",
  },
  {
    key: "subscriptions.daily_usage.peak_day",
    defaultText: "Peak day: {date} • {credits} credits",
    description: "Label summarising the peak usage day.",
  },
  {
    key: "subscriptions.range.label",
    defaultText: "Range",
    description: "Label for the daily usage range select.",
  },
  {
    key: "subscriptions.range.option",
    defaultText: "Last {days} days",
    description: "Option label in the daily usage range select.",
  },
  {
    key: "subscriptions.session_usage.title",
    defaultText: "Usage by session",
    description: "Heading for the session usage table.",
  },
  {
    key: "subscriptions.session_usage.subtitle",
    defaultText: "Total credits used across your recent chats.",
    description: "Subtitle for the session usage table.",
  },
  {
    key: "subscriptions.session_usage.headers.chat_id",
    defaultText: "Chat ID",
    description: "Column header for the chat ID.",
  },
  {
    key: "subscriptions.session_usage.headers.credits_used",
    defaultText: "Credits used",
    description: "Column header for credits used.",
  },
  {
    key: "subscriptions.session_usage.empty",
    defaultText: "No usage recorded yet.",
    description: "Empty state text for the session usage table.",
  },
  {
    key: "subscriptions.pagination.updating",
    defaultText: "Updating...",
    description: "Label shown while pagination is updating.",
  },
  {
    key: "subscriptions.pagination.prev",
    defaultText: "View fewer sessions",
    description: "Button label for viewing fewer sessions.",
  },
  {
    key: "subscriptions.pagination.page",
    defaultText: "Page {current} of {total}",
    description: "Pagination status text.",
  },
  {
    key: "subscriptions.pagination.next",
    defaultText: "View more sessions",
    description: "Button label for viewing more sessions.",
  },
  {
    key: "subscriptions.pagination.no_more",
    defaultText: "No more data",
    description: "Label when there are no more sessions to load.",
  },
  {
    key: "recharge.tagline",
    defaultText: "Pricing",
    description: "Uppercase tagline shown above the recharge page title.",
  },
  {
    key: "recharge.title",
    defaultText: "Choose your plan",
    description: "Heading for the recharge page.",
  },
  {
    key: "recharge.subtitle",
    defaultText:
      "Unlock more capacity and features by picking a plan that scales with your needs. Activate instantly and start building without interruption.",
    description: "Subtitle explaining the recharge page.",
  },
  {
    key: "recharge.status.success",
    defaultText: "Payment successful. Your credits have been updated.",
    description: "Status message after successful payment.",
  },
  {
    key: "recharge.status.cancelled",
    defaultText: "Payment cancelled.",
    description: "Status message when the payment modal is dismissed.",
  },
  {
    key: "recharge.status.failure_generic",
    defaultText: "Payment failed. Please try again or contact support.",
    description: "Status message when Razorpay reports a failure.",
  },
  {
    key: "recharge.status.initialize_failed",
    defaultText: "Failed to initialize payment.",
    description: "Error when the Razorpay order could not be created.",
  },
  {
    key: "recharge.status.verify_failed",
    defaultText: "Failed to confirm payment.",
    description: "Error when Razorpay payment verification fails.",
  },
  {
    key: "recharge.status.razorpay_unavailable",
    defaultText: "Razorpay is not available.",
    description: "Error shown if the Razorpay SDK is missing.",
  },
  {
    key: "recharge.status.error_generic",
    defaultText: "Something went wrong while processing the payment.",
    description: "Fallback status message when an unexpected error occurs.",
  },
  {
    key: "recharge.plan.badge.recommended",
    defaultText: "Recommended",
    description: "Badge shown on the recommended plan card.",
  },
  {
    key: "recharge.plan.price.free",
    defaultText: "Free",
    description: "Price label used for free plans.",
  },
  {
    key: "recharge.plan.credits",
    defaultText: "{credits} credits",
    description: "Label showing credit allowance in a plan.",
  },
  {
    key: "recharge.plan.validity",
    defaultText: "Validity: {days} days",
    description: "Label showing the plan validity duration.",
  },
  {
    key: "recharge.plan.pill.active",
    defaultText: "Previously recharged",
    description: "Pill shown on the active plan card.",
  },
  {
    key: "recharge.plan.button.recharge_again",
    defaultText: "Recharge again",
    description: "Button label for re-purchasing a paid plan.",
  },
  {
    key: "recharge.plan.button.free",
    defaultText: "Free Plan",
    description: "Disabled button label for the free plan.",
  },
  {
    key: "recharge.plan.button.get",
    defaultText: "Get {plan}",
    description: "CTA button label for purchasing a plan.",
  },
  {
    key: "recharge.plan.button.processing",
    defaultText: "Processing...",
    description: "Button label while checkout is loading.",
  },
  {
    key: "recharge.plan.checkout_description",
    defaultText: "Recharge credits",
    description: "Description passed to the Razorpay checkout modal.",
  },
  {
    key: "recharge.current_balance.title",
    defaultText: "Current balance",
    description: "Heading for the current balance card.",
  },
  {
    key: "recharge.current_balance.remaining",
    defaultText: "Credits remaining",
    description: "Label for credits remaining in the current balance card.",
  },
  {
    key: "recharge.current_balance.valid_until",
    defaultText: "Credits valid until",
    description: "Label for the expiry date in the current balance card.",
  },
  {
    key: "contact.form.heading",
    defaultText: "Contact the team",
    description: "Heading for the contact form section.",
  },
  {
    key: "contact.form.caption",
    defaultText:
      "Share feedback, partnership ideas, or support questions. We usually reply within one working day.",
    description: "Subtitle for the contact form.",
  },
  {
    key: "contact.form.field.name",
    defaultText: "Name",
    description: "Label for the name field.",
  },
  {
    key: "contact.form.placeholder.name",
    defaultText: "Your name",
    description: "Placeholder for the name field.",
  },
  {
    key: "contact.form.field.email",
    defaultText: "Email",
    description: "Label for the email field.",
  },
  {
    key: "contact.form.placeholder.email",
    defaultText: "you@example.com",
    description: "Placeholder for the email field.",
  },
  {
    key: "contact.form.field.phone",
    defaultText: "Phone (optional)",
    description: "Label for the phone field.",
  },
  {
    key: "contact.form.placeholder.phone",
    defaultText: "+91 98765 43210",
    description: "Placeholder for the phone field.",
  },
  {
    key: "contact.form.field.subject",
    defaultText: "Subject",
    description: "Label for the subject field.",
  },
  {
    key: "contact.form.placeholder.subject",
    defaultText: "How can we help?",
    description: "Placeholder for the subject field.",
  },
  {
    key: "contact.form.field.message",
    defaultText: "Message",
    description: "Label for the message textarea.",
  },
  {
    key: "contact.form.placeholder.message",
    defaultText: "Share a few details about your request...",
    description: "Placeholder for the message textarea.",
  },
  {
    key: "contact.form.submit.sending",
    defaultText: "Sending...",
    description: "Button label while submitting the contact form.",
  },
  {
    key: "contact.form.submit.default",
    defaultText: "Send message",
    description: "Default contact form submit button label.",
  },
  {
    key: "contact.form.submit.success",
    defaultText: "Thanks! We'll reach out soon.",
    description: "Success message after the contact form is submitted.",
  },
  {
    key: "contact.form.submit.error_generic",
    defaultText: "Please review the highlighted fields.",
    description: "Generic error shown when the contact form validation fails.",
  },
  {
    key: "complete_profile.heading",
    defaultText: "Almost there!",
    description: "Heading for the profile completion page.",
  },
  {
    key: "complete_profile.subheading",
    defaultText:
      "Please confirm your name and date of birth. We can only offer access to people who are at least 13 years old.",
    description: "Subheading explaining why profile details are needed.",
  },
  {
    key: "complete_profile.first_name.label",
    defaultText: "First name",
    description: "Label for the first name field during profile completion.",
  },
  {
    key: "complete_profile.first_name.placeholder",
    defaultText: "Enter your first name",
    description: "Placeholder for the first name input.",
  },
  {
    key: "complete_profile.last_name.label",
    defaultText: "Last name",
    description: "Label for the last name field during profile completion.",
  },
  {
    key: "complete_profile.last_name.placeholder",
    defaultText: "Enter your last name",
    description: "Placeholder for the last name input.",
  },
  {
    key: "complete_profile.dob.label",
    defaultText: "Date of birth",
    description: "Label for the date of birth field.",
  },
  {
    key: "complete_profile.dob.helper",
    defaultText:
      "We use this to verify that you meet the minimum age requirement (13+).",
    description: "Helper text explaining why date of birth is required.",
  },
  {
    key: "complete_profile.submit",
    defaultText: "Save and continue",
    description: "Submit button label on the profile completion form.",
  },
];
