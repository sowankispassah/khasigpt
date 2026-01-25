import type { TranslationDefinition } from "./dictionary";

export const STATIC_TRANSLATION_DEFINITIONS: TranslationDefinition[] = [
  {
    key: "greeting.title",
    defaultText: "Hi, {name}",
    description:
      "Greeting headline above the chat input. Use {name} as the placeholder for the user's first name.",
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
    key: "user_menu.creator_dashboard",
    defaultText: "Creator dashboard",
    description: "Menu item linking to the creator performance dashboard.",
  },
  {
    key: "user_menu.community_forum",
    defaultText: "Community Forum",
    description: "Menu item linking to the community forum.",
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
    key: "common.clear",
    defaultText: "Clear",
    description: "Generic clear/reset action label.",
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
    key: "login.error.link_required",
    defaultText:
      "Please use the sign-in link sent to your email before continuing.",
    description: "Error shown when the account requires email link sign-in.",
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
    key: "register.error.rate_limited",
    defaultText: "Too many attempts. Please wait and try again.",
    description: "Toast message when registration is rate limited.",
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
    key: "forgot_password.title",
    defaultText: "Forgot password",
    description: "Heading for the forgot password page.",
  },
  {
    key: "forgot_password.subtitle",
    defaultText:
      "Enter your email and we will send you a link to reset your password.",
    description: "Supporting copy on the forgot password page.",
  },
  {
    key: "forgot_password.email_label",
    defaultText: "Email address",
    description: "Label for the email input on the forgot password form.",
  },
  {
    key: "forgot_password.email_placeholder",
    defaultText: "you@example.com",
    description: "Placeholder text for the forgot password email input.",
  },
  {
    key: "forgot_password.sending",
    defaultText: "Sending...",
    description: "Button label while the reset link is being sent.",
  },
  {
    key: "forgot_password.submit",
    defaultText: "Send reset link",
    description: "Button label to request a password reset link.",
  },
  {
    key: "forgot_password.remembered",
    defaultText: "Remembered your password?",
    description: "Prompt before the back-to-sign-in link.",
  },
  {
    key: "forgot_password.back_to_sign_in",
    defaultText: "Back to sign in",
    description: "Link text back to the sign-in page.",
  },
  {
    key: "reset_password.title",
    defaultText: "Reset password",
    description: "Heading for the reset password page.",
  },
  {
    key: "reset_password.subtitle",
    defaultText: "Choose a new password for your account.",
    description: "Supporting copy on the reset password page.",
  },
  {
    key: "reset_password.invalid_title",
    defaultText: "Invalid link",
    description: "Heading shown when reset password link is invalid.",
  },
  {
    key: "reset_password.invalid_message",
    defaultText:
      "This password reset link is missing or malformed. Request a new link and try again.",
    description: "Message shown when reset password link is invalid.",
  },
  {
    key: "verify_email.title.verified",
    defaultText: "Email verified",
    description: "Heading shown when the email is verified.",
  },
  {
    key: "verify_email.message.verified",
    defaultText:
      "Your account is now active. You can sign in using your email and password.",
    description: "Message shown after successful email verification.",
  },
  {
    key: "verify_email.title.already_verified",
    defaultText: "Email already verified",
    description: "Heading shown when the email is already verified.",
  },
  {
    key: "verify_email.message.already_verified",
    defaultText: "You can sign in right away using your credentials.",
    description: "Message shown when the email was already verified.",
  },
  {
    key: "verify_email.title.expired",
    defaultText: "Verification link expired",
    description: "Heading shown when the verification link is expired.",
  },
  {
    key: "verify_email.message.expired",
    defaultText:
      "The verification link has expired. Please retry signup to receive a new email.",
    description: "Message shown when the verification link is expired.",
  },
  {
    key: "verify_email.title.invalid",
    defaultText: "Invalid verification link",
    description: "Heading shown when the verification link is invalid.",
  },
  {
    key: "verify_email.message.invalid",
    defaultText:
      "The verification token is invalid or has already been used. Please request a new verification email.",
    description: "Message shown when the verification link is invalid.",
  },
  {
    key: "verify_email.continue_prompt",
    defaultText: "Continue to sign in once your account is ready.",
    description: "Prompt beneath the verification status message.",
  },
  {
    key: "verify_email.sign_in_button",
    defaultText: "Go to sign in",
    description: "Button text linking to the sign-in page.",
  },
  {
    key: "offline.title",
    defaultText: "You're offline",
    description: "Heading for the offline page.",
  },
  {
    key: "offline.message",
    defaultText:
      "No internet connection detected. Once you're back online, you can keep chatting with KhasiGPT in the browser or installed app.",
    description: "Message shown on the offline page.",
  },
  {
    key: "offline.retry",
    defaultText: "Retry connection",
    description: "Button label to retry connection on the offline page.",
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
    defaultText:
      "This chat has been deleted. You are viewing it in read-only mode.",
    description: "Banner text shown to admins when viewing a deleted chat.",
  },
  {
    key: "chat.history.load_more",
    defaultText: "Load earlier messages",
    description: "Button label to fetch older chat messages.",
  },
  {
    key: "chat.history.loading",
    defaultText: "Loading earlier messages...",
    description: "Label shown while older messages are loading.",
  },
  {
    key: "chat.history.show_older",
    defaultText: "Show {count} earlier messages",
    description: "Button label to reveal older messages already loaded.",
  },
  {
    key: "chat.history.load_failed",
    defaultText: "Unable to load earlier messages.",
    description: "Toast message when loading chat history fails.",
  },
  {
    key: "chat.input.placeholder",
    defaultText: "Send a message...",
    description: "Placeholder text for the main chat input.",
  },
  {
    key: "chat.language.ui_prompt.title",
    defaultText: "Change interface language?",
    description: "Title for the UI language change confirmation dialog.",
  },
  {
    key: "chat.language.ui_prompt.description",
    defaultText:
      "Do you also want the interface language to change to {language}?",
    description: "Body text for the UI language change confirmation dialog.",
  },
  {
    key: "chat.language.ui_prompt.cancel",
    defaultText: "No, keep interface",
    description: "Cancel button label for the UI language change dialog.",
  },
  {
    key: "chat.language.ui_prompt.confirm",
    defaultText: "Yes, change interface",
    description: "Confirm button label for the UI language change dialog.",
  },
  {
    key: "chat.language.ui_prompt.loading",
    defaultText: "Switching interface language...",
    description: "Loading text shown while the UI language is changing.",
  },
  {
    key: "image.mode.toggle",
    defaultText: "Generate image",
    description: "Label for the image generation mode toggle.",
  },
  {
    key: "image.input.placeholder",
    defaultText: "Describe the image you want to generate...",
    description: "Placeholder text shown in image generation mode.",
  },
  {
    key: "image.disabled",
    defaultText: "Image generation is currently unavailable.",
    description: "Toast message when image generation is disabled.",
  },
  {
    key: "image.actions.title",
    defaultText: "Generate images",
    description: "Heading for the image generation shortcut on the chat home.",
  },
  {
    key: "image.actions.subtitle",
    defaultText: "Use Nano Banana to create visuals without leaving chat.",
    description: "Supporting copy under the image generation shortcut.",
  },
  {
    key: "image.actions.text_to_image.title",
    defaultText: "Text to image",
    description: "Card label for the text-to-image option.",
  },
  {
    key: "image.actions.text_to_image.description",
    defaultText: "Describe a scene and let Nano Banana render it.",
    description: "Helper text for the text-to-image option card.",
  },
  {
    key: "image.actions.image_to_image.title",
    defaultText: "Image to image",
    description: "Card label for the image-to-image option.",
  },
  {
    key: "image.actions.image_to_image.description",
    defaultText: "Transform an existing image with a new prompt.",
    description: "Helper text for the image-to-image option card.",
  },
  {
    key: "image.actions.locked.tooltip",
    defaultText: "Recharge credits to generate images.",
    description: "Tooltip shown when image generation is locked.",
  },
  {
    key: "image.actions.locked.free.tooltip",
    defaultText: "Free credits can't be used for images.",
    description:
      "Tooltip shown when image generation requires paid credits only.",
  },
  {
    key: "image.actions.locked.title",
    defaultText: "Recharge credits to generate images",
    description: "Modal title shown to free users attempting image generation.",
  },
  {
    key: "image.actions.locked.free.title",
    defaultText: "Free credits can't be used for images",
    description:
      "Modal title shown when paid credits are required for image generation.",
  },
  {
    key: "image.actions.locked.description",
    defaultText:
      "Image generation is available for paid plans or users with active credits.",
    description: "Modal description shown when image generation is locked.",
  },
  {
    key: "image.actions.locked.free.description",
    defaultText: "You are using free credits. Recharge to generate images.",
    description:
      "Modal description shown when users only have free credits.",
  },
  {
    key: "image.actions.locked.cta",
    defaultText: "Go to recharge",
    description: "CTA button label to navigate to the recharge page.",
  },
  {
    key: "image.page.title",
    defaultText: "Image generation",
    description: "Page title for the image generation screen.",
  },
  {
    key: "image.page.subtitle",
    defaultText:
      "Create visuals with Nano Banana. Switch between text-to-image and image-to-image anytime.",
    description: "Subtitle on the image generation page.",
  },
  {
    key: "image.mode.text",
    defaultText: "Text to image",
    description: "Toggle label for text-to-image mode.",
  },
  {
    key: "image.mode.image",
    defaultText: "Image to image",
    description: "Toggle label for image-to-image mode.",
  },
  {
    key: "image.prompt.label",
    defaultText: "Prompt",
    description: "Label for the image generation prompt field.",
  },
  {
    key: "image.prompt.placeholder",
    defaultText: "A cinematic close-up of a banana astronaut...",
    description: "Placeholder text for the image generation prompt field.",
  },
  {
    key: "image.prompt.helper",
    defaultText:
      "Describe the image you want. Be specific with style, lighting, and mood.",
    description: "Helper text under the image generation prompt.",
  },
  {
    key: "image.prompt.required",
    defaultText: "Add a prompt before generating.",
    description: "Validation message for missing image prompt.",
  },
  {
    key: "image.upload.label",
    defaultText: "Reference image",
    description: "Label for the image-to-image upload area.",
  },
  {
    key: "image.upload.helper",
    defaultText: "Upload a PNG or JPG (max 5MB).",
    description: "Helper text for the image-to-image file uploader.",
  },
  {
    key: "image.upload.clear",
    defaultText: "Remove",
    description: "Button label to clear the uploaded reference image.",
  },
  {
    key: "image.upload.preview",
    defaultText: "Reference preview",
    description: "Alt text for the reference image preview.",
  },
  {
    key: "image.upload.empty",
    defaultText: "Add a reference image to guide the generation.",
    description: "Placeholder text when no reference image is uploaded.",
  },
  {
    key: "image.upload.invalid_type",
    defaultText: "Please upload a PNG or JPG file.",
    description: "Validation message for unsupported image types.",
  },
  {
    key: "image.upload.too_large",
    defaultText: "Images must be 5MB or smaller.",
    description: "Validation message for oversized images.",
  },
  {
    key: "image.upload.failed",
    defaultText: "Failed to read the uploaded image.",
    description: "Error message when the image file cannot be read.",
  },
  {
    key: "image.upload.required",
    defaultText: "Upload a reference image to continue.",
    description: "Validation message when image-to-image is missing a file.",
  },
  {
    key: "image.generate.cta",
    defaultText: "Generate image",
    description: "Primary CTA for starting image generation.",
  },
  {
    key: "image.generate.loading",
    defaultText: "Generating...",
    description: "Loading label while an image is being generated.",
  },
  {
    key: "image.generate.failed",
    defaultText: "Image generation failed. Please try again.",
    description: "Fallback error message when generation fails.",
  },
  {
    key: "image.generate.empty",
    defaultText: "No image was returned. Try a different prompt.",
    description: "Message shown when the API returns no images.",
  },
  {
    key: "image.results.title",
    defaultText: "Generated output",
    description: "Title for the image results panel.",
  },
  {
    key: "image.results.count",
    defaultText: "Results",
    description: "Label prefix for the image results count.",
  },
  {
    key: "image.results.alt",
    defaultText: "Generated image",
    description: "Alt text for generated images.",
  },
  {
    key: "image.results.empty",
    defaultText: "Your generated images will appear here.",
    description: "Placeholder text when no images have been generated yet.",
  },
  {
    key: "image.access.locked",
    defaultText:
      "Image generation is available for users with active credits or a paid plan.",
    description: "Banner text shown when image generation is locked.",
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
    key: "profile.name.title",
    defaultText: "Personal details",
    description: "Heading for the name section on the profile page.",
  },
  {
    key: "profile.name.description",
    defaultText: "Update how your name appears across the product.",
    description: "Supporting copy for the name section on the profile page.",
  },
  {
    key: "profile.name.first_label",
    defaultText: "First name",
    description: "Label for the first name field on the profile page.",
  },
  {
    key: "profile.name.last_label",
    defaultText: "Last name",
    description: "Label for the last name field on the profile page.",
  },
  {
    key: "profile.name.success",
    defaultText: "Your name has been updated.",
    description: "Toast message when the name update succeeds.",
  },
  {
    key: "profile.name.saving",
    defaultText: "Saving...",
    description: "Button label while name update is saving.",
  },
  {
    key: "profile.name.save_button",
    defaultText: "Save changes",
    description: "Button label to save profile name changes.",
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
    defaultText: "Failed to update profile image. Please try again.",
    description: "Generic error for failed uploads.",
  },
  {
    key: "profile.picture.error.unexpected",
    defaultText: "Unexpected error while uploading image. Please try again.",
    description: "Error when an unexpected upload issue occurs.",
  },
  {
    key: "profile.picture.error.remove_generic",
    defaultText: "Failed to remove profile image. Please try again.",
    description: "Generic error when removing the profile image fails.",
  },
  {
    key: "profile.picture.error.unexpected_remove",
    defaultText: "Unexpected error while removing image. Please try again.",
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
    description:
      "Message shown when history is unavailable because the user is signed out.",
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
    description:
      "Delete confirmation dialog description in chat history sidebar.",
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
    defaultText: "Admin credits remaining",
    description:
      "Row label for remaining credits that were manually granted by an admin.",
  },
  {
    key: "subscriptions.plan_overview.credits_recharged",
    defaultText: "Paid credits remaining",
    description: "Row label for remaining credits purchased via recharges.",
  },
  {
    key: "subscriptions.plan_overview.plan_expires",
    defaultText: "Plan expires",
    description: "Row label for plan expiry.",
  },
  {
    key: "subscriptions.recharge_history.title",
    defaultText: "Recharge history",
    description: "Heading for the recharge history section.",
  },
  {
    key: "subscriptions.recharge_history.subtitle",
    defaultText: "Recent top-ups you've completed.",
    description: "Subtitle explaining the recharge history section.",
  },
  {
    key: "subscriptions.recharge_history.empty",
    defaultText: "You haven't recharged your account yet.",
    description: "Fallback text when there are no recharge entries.",
  },
  {
    key: "subscriptions.recharge_history.column.plan",
    defaultText: "Plan",
    description: "Column label for plan name in recharge history.",
  },
  {
    key: "subscriptions.recharge_history.column.amount",
    defaultText: "Amount",
    description: "Column label for amount in recharge history.",
  },
  {
    key: "subscriptions.recharge_history.column.status",
    defaultText: "Status",
    description: "Column label for status in recharge history.",
  },
  {
    key: "subscriptions.recharge_history.column.date",
    defaultText: "Date",
    description: "Column label for date in recharge history.",
  },
  {
    key: "subscriptions.recharge_history.unknown_plan",
    defaultText: "Plan unavailable",
    description:
      "Fallback text when a plan name is missing in recharge history.",
  },
  {
    key: "subscriptions.recharge_history.trigger_label",
    defaultText: "View recharge history",
    description: "Aria-label for the icon button that opens recharge history.",
  },
  {
    key: "subscriptions.recharge_history.close_button",
    defaultText: "Close",
    description:
      "Label for the close button inside the recharge history dialog.",
  },
  {
    key: "subscriptions.recharge_history.status.pending",
    defaultText: "Pending",
    description: "Status label for pending recharge entries.",
  },
  {
    key: "subscriptions.recharge_history.status.processing",
    defaultText: "Processing",
    description: "Status label for processing recharge entries.",
  },
  {
    key: "subscriptions.recharge_history.status.paid",
    defaultText: "Paid",
    description: "Status label for successful recharge entries.",
  },
  {
    key: "subscriptions.recharge_history.status.failed",
    defaultText: "Failed",
    description: "Status label for failed recharge entries.",
  },
  {
    key: "subscriptions.recharge_history.status.unknown",
    defaultText: "Unknown",
    description: "Fallback status label when recharge status is missing.",
  },
  {
    key: "subscriptions.recharge_history.try_again",
    defaultText: "Try again",
    description: "Tooltip text for the retry icon in recharge history.",
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
    key: "subscriptions.session_usage.headers.chat",
    defaultText: "Chat",
    description: "Column header for the session chat details.",
  },
  {
    key: "subscriptions.session_usage.headers.created",
    defaultText: "Started on",
    description: "Column header for the chat creation date.",
  },
  {
    key: "subscriptions.session_usage.headers.last_used",
    defaultText: "Last activity",
    description: "Column header for the last usage timestamp.",
  },
  {
    key: "subscriptions.session_usage.headers.credits_used",
    defaultText: "Credits used",
    description: "Column header for credits used.",
  },
  {
    key: "subscriptions.session_usage.sort.label",
    defaultText: "Sort sessions",
    description: "Label for the session usage sort select.",
  },
  {
    key: "subscriptions.session_usage.sort.latest",
    defaultText: "Latest activity",
    description: "Sort option label for ordering by most recent sessions.",
  },
  {
    key: "subscriptions.session_usage.sort.usage",
    defaultText: "Highest credits used",
    description: "Sort option label for ordering by usage totals.",
  },
  {
    key: "subscriptions.session_usage.empty",
    defaultText: "No usage recorded yet.",
    description: "Empty state text for the session usage table.",
  },
  {
    key: "subscriptions.session_usage.untitled_chat",
    defaultText: "Untitled chat",
    description: "Fallback title when a chat is missing a name.",
  },
  {
    key: "subscriptions.session_usage.created.unknown",
    defaultText: "Not available",
    description: "Fallback text when the chat start date is missing.",
  },
  {
    key: "subscriptions.session_usage.last_used.unknown",
    defaultText: "Not available",
    description: "Fallback text when no last usage timestamp is present.",
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
    key: "recharge.dialog.title",
    defaultText: "Review your recharge",
    description:
      "Title for the order confirmation dialog on the recharge page.",
  },
  {
    key: "recharge.dialog.description",
    defaultText:
      "Confirm the plan details and apply a coupon before continuing to payment.",
    description: "Helper text shown in the order confirmation dialog.",
  },
  {
    key: "recharge.dialog.plan_placeholder",
    defaultText: "Selected plan",
    description:
      "Fallback label when the plan name is loading inside the dialog.",
  },
  {
    key: "recharge.dialog.summary.discount",
    defaultText: "Coupon discount",
    description: "Label for the discount row in the order summary.",
  },
  {
    key: "recharge.dialog.summary.total",
    defaultText: "Total due",
    description: "Label for the final amount row in the order summary.",
  },
  {
    key: "recharge.dialog.coupon_label",
    defaultText: "Coupon code",
    description: "Label for the coupon input inside the order dialog.",
  },
  {
    key: "recharge.dialog.coupon_helper",
    defaultText: "Coupons are optional. Leave blank if you don't have one.",
    description: "Helper text below the coupon input.",
  },
  {
    key: "recharge.dialog.coupon_required",
    defaultText: "Enter a coupon code to validate.",
    description:
      "Inline error shown when the user tries to validate with an empty code.",
  },
  {
    key: "recharge.dialog.coupon_invalid",
    defaultText: "Coupon is invalid or expired.",
    description: "Fallback error when coupon validation fails.",
  },
  {
    key: "recharge.dialog.coupon_applied",
    defaultText: "Coupon applied successfully.",
    description: "Status message after a coupon validates in the dialog.",
  },
  {
    key: "recharge.dialog.validate",
    defaultText: "Validate coupon",
    description: "Button label for validating a coupon in the dialog.",
  },
  {
    key: "recharge.dialog.validating",
    defaultText: "Validating...",
    description: "Button label while the coupon validation request is pending.",
  },
  {
    key: "recharge.dialog.proceed",
    defaultText: "Proceed to payment",
    description: "Primary CTA label in the order confirmation dialog.",
  },
  {
    key: "recharge.status.coupon_applied",
    defaultText: "Coupon {code} applied. You save {amount} on this recharge.",
    description: "Toast message shown when a coupon is successfully applied.",
  },
  {
    key: "recharge.coupon.label",
    defaultText: "Have a coupon code?",
    description: "Heading for the recharge coupon input section.",
  },
  {
    key: "recharge.coupon.help",
    defaultText: "Enter a creator coupon to unlock discounts during checkout.",
    description: "Helper text beneath the coupon input label.",
  },
  {
    key: "recharge.coupon.input_label",
    defaultText: "Coupon code",
    description: "Accessible label for the coupon code input.",
  },
  {
    key: "recharge.coupon.placeholder",
    defaultText: "CREATOR10",
    description: "Placeholder text for the coupon input field.",
  },
  {
    key: "recharge.coupon.clear",
    defaultText: "Clear",
    description: "Button label to clear the current coupon input.",
  },
  {
    key: "recharge.coupon.applied_summary",
    defaultText: "Coupon {code} will save you ₹{amount} on the next recharge.",
    description: "Helper text displayed when a coupon is queued for checkout.",
  },
  {
    key: "recharge.coupon.pending",
    defaultText: "Coupons are validated when you start the payment.",
    description: "Helper text shown when no coupon is active yet.",
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
  {
    key: "forum.hero.tagline",
    defaultText: "Community Forum",
    description: "Eyebrow label above the forum hero heading.",
  },
  {
    key: "forum.hero.title",
    defaultText: "Discuss product ideas with KhasiGPT builders",
    description: "Headline shown at the top of the forum page.",
  },
  {
    key: "forum.hero.subtitle",
    defaultText:
      "Ask for help, share language resources, or report issues. Our team and community reply quickly with actionable guidance.",
    description: "Supporting paragraph beneath the forum hero heading.",
  },
  {
    key: "forum.hero.stats.total_label",
    defaultText: "Total topics",
    description: "Label beneath the total thread count in the hero stats.",
  },
  {
    key: "forum.hero.stats.visible_label",
    defaultText: "Visible now",
    description: "Label beneath the currently visible thread count.",
  },
  {
    key: "forum.hero.image_alt",
    defaultText: "KhasiGPT community badge",
    description: "Alt text for the badge image displayed on the forum hero.",
  },
  {
    key: "forum.search.placeholder",
    defaultText: "Search discussions, tags, or keywords",
    description: "Placeholder text for the forum search input.",
  },
  {
    key: "forum.search.submit",
    defaultText: "Search",
    description: "Search button label on the forum page.",
  },
  {
    key: "forum.search.pending",
    defaultText: "Searching…",
    description: "Button label while the forum search is running.",
  },
  {
    key: "forum.filters.label",
    defaultText: "Active filters:",
    description: "Label preceding the list of applied forum filters.",
  },
  {
    key: "forum.filters.category",
    defaultText: "Category: {value}",
    description: "Badge label describing the active category filter.",
  },
  {
    key: "forum.filters.tag",
    defaultText: "Tag: #{value}",
    description: "Badge label describing the active tag filter.",
  },
  {
    key: "forum.filters.search",
    defaultText: 'Search: "{value}"',
    description: "Badge label describing the current search query filter.",
  },
  {
    key: "forum.empty.title",
    defaultText: "No discussions yet",
    description: "Heading for the empty state when no forum threads exist.",
  },
  {
    key: "forum.empty.subtitle",
    defaultText: "Be the first to start a topic in this category.",
    description: "Supporting text for the empty forum state.",
  },
  {
    key: "forum.list.load_more",
    defaultText: "Load more discussions",
    description: "Button label to load additional forum threads.",
  },
  {
    key: "forum.list.loading_more",
    defaultText: "Loading…",
    description: "Status text shown while more threads are loading.",
  },
  {
    key: "forum.toast.load_more_error",
    defaultText: "Unable to load more discussions right now.",
    description: "Toast message shown when the load-more request fails.",
  },
  {
    key: "forum.sidebar.categories.title",
    defaultText: "Categories",
    description: "Heading for the forum categories sidebar card.",
  },
  {
    key: "forum.sidebar.categories.reset",
    defaultText: "Reset",
    description: "Link that clears all forum filters.",
  },
  {
    key: "forum.sidebar.categories.all",
    defaultText: "All discussions",
    description: "Link that shows all forum threads regardless of category.",
  },
  {
    key: "forum.sidebar.tags.title",
    defaultText: "Trending Tags",
    description: "Heading for the trending tags sidebar card.",
  },
  {
    key: "forum.sidebar.tags.empty",
    defaultText: "No tags available yet.",
    description: "Message shown when no forum tags are available.",
  },
  {
    key: "forum.composer.button",
    defaultText: "Start a discussion",
    description: "CTA button that opens the forum thread composer.",
  },
  {
    key: "forum.composer.button_tooltip",
    defaultText: "Sign in to start a discussion.",
    description: "Tooltip shown when unauthenticated users hover the CTA.",
  },
  {
    key: "forum.composer.sheet_title",
    defaultText: "Start a discussion",
    description: "Default heading inside the forum composer sheet.",
  },
  {
    key: "forum.composer.sheet_title_with_name",
    defaultText: "Hi {name}, share an update",
    description: "Personalized heading when the user has a first name.",
  },
  {
    key: "forum.composer.error.max_tags",
    defaultText: "You can only select up to 5 tags.",
    description: "Error shown when the tag selection limit is exceeded.",
  },
  {
    key: "forum.composer.error.title_short",
    defaultText: "Title must be at least 8 characters long.",
    description: "Validation error for short thread titles.",
  },
  {
    key: "forum.composer.error.category_required",
    defaultText: "Please select a category.",
    description: "Validation error when no category is selected.",
  },
  {
    key: "forum.composer.error.content_short",
    defaultText: "Describe your discussion in more detail.",
    description: "Validation error for short thread bodies.",
  },
  {
    key: "forum.composer.title.label",
    defaultText: "Title",
    description: "Label for the thread title input.",
  },
  {
    key: "forum.composer.title.placeholder",
    defaultText: "What would you like to discuss?",
    description: "Placeholder for the thread title input.",
  },
  {
    key: "forum.composer.category.label",
    defaultText: "Category",
    description: "Label for the category select input.",
  },
  {
    key: "forum.composer.category.placeholder",
    defaultText: "Select a category",
    description: "Placeholder text for the category select input.",
  },
  {
    key: "forum.composer.category.locked",
    defaultText: "(locked)",
    description: "Suffix shown next to locked categories.",
  },
  {
    key: "forum.composer.details.label",
    defaultText: "Details",
    description: "Label for the discussion details textarea.",
  },
  {
    key: "forum.composer.details.note",
    defaultText: "(Markdown formatting supported soon)",
    description: "Helper note beneath the composer details label.",
  },
  {
    key: "forum.composer.details.placeholder",
    defaultText:
      "Share the full context, code snippets, or anything that helps the community respond faster.",
    description: "Placeholder text for the thread body textarea.",
  },
  {
    key: "forum.composer.tags.label",
    defaultText: "Tags",
    description: "Label for the tag chips selector.",
  },
  {
    key: "forum.composer.tags.count",
    defaultText: "{count}/5 selected",
    description: "Helper text showing how many tags are selected.",
  },
  {
    key: "forum.composer.tags.empty",
    defaultText: "No tags available yet.",
    description: "Message shown when there are no tags to choose from.",
  },
  {
    key: "forum.composer.submit",
    defaultText: "Publish discussion",
    description: "Primary action button inside the composer sheet.",
  },
  {
    key: "forum.composer.submit_pending",
    defaultText: "Publishing…",
    description: "Loading label shown while a thread is being published.",
  },
  {
    key: "forum.composer.login_required.title",
    defaultText: "Sign in to continue",
    description: "Alert title shown when unauthenticated users open composer.",
  },
  {
    key: "forum.composer.login_required.body",
    defaultText:
      "You need to be logged in to start a discussion. Please sign in and then return to the forum.",
    description: "Description in the login-required dialog.",
  },
  {
    key: "forum.composer.login_required.cancel",
    defaultText: "Not now",
    description: "Cancel button text in the login-required dialog.",
  },
  {
    key: "forum.composer.login_required.confirm",
    defaultText: "Go to login",
    description: "Confirm button text in the login-required dialog.",
  },
  {
    key: "forum.composer.toast.created",
    defaultText: "Discussion created! Redirecting...",
    description: "Toast shown after a new forum discussion is created.",
  },
  {
    key: "forum.category_manager.button",
    defaultText: "Add category",
    description: "Button label that opens the forum category manager sheet.",
  },
  {
    key: "forum.category_manager.sheet_title",
    defaultText: "Add a new forum category",
    description: "Heading for the forum category manager sheet.",
  },
  {
    key: "forum.category_manager.field.name.label",
    defaultText: "Name",
    description: "Label for the forum category name field.",
  },
  {
    key: "forum.category_manager.field.name.placeholder",
    defaultText: "e.g. Product Help",
    description: "Placeholder for the forum category name field.",
  },
  {
    key: "forum.category_manager.field.slug.label",
    defaultText: "Slug",
    description: "Label for the forum category slug field.",
  },
  {
    key: "forum.category_manager.field.slug.placeholder",
    defaultText: "product-help",
    description: "Placeholder for the forum category slug field.",
  },
  {
    key: "forum.category_manager.field.description.label",
    defaultText: "Description",
    description: "Label for the forum category description field.",
  },
  {
    key: "forum.category_manager.field.description.placeholder",
    defaultText: "Visible on the forum page to describe what belongs here.",
    description: "Placeholder for the forum category description field.",
  },
  {
    key: "forum.category_manager.field.position.label",
    defaultText: "Position",
    description: "Label for the forum category position field.",
  },
  {
    key: "forum.category_manager.field.locked.label",
    defaultText: "Locked",
    description: "Label for the forum category lock toggle.",
  },
  {
    key: "forum.category_manager.field.locked.helper",
    defaultText: "Prevent new threads in this category",
    description: "Helper text for the forum category lock toggle.",
  },
  {
    key: "forum.category_manager.submit",
    defaultText: "Save category",
    description: "Submit button label for the forum category manager form.",
  },
  {
    key: "forum.category_manager.submit_pending",
    defaultText: "Saving…",
    description:
      "Submit button label while the forum category manager form is saving.",
  },
  {
    key: "forum.category_manager.error.name_short",
    defaultText: "Category name must be at least 3 characters long.",
    description: "Validation error for short forum category names.",
  },
  {
    key: "forum.category_manager.error.slug_required",
    defaultText: "Slug cannot be empty.",
    description: "Validation error when the forum category slug is blank.",
  },
  {
    key: "forum.category_manager.toast.created",
    defaultText: "Category created.",
    description: "Toast shown after creating a forum category.",
  },
  {
    key: "forum.thread.pinned",
    defaultText: "Pinned",
    description: "Badge shown on pinned forum threads.",
  },
  {
    key: "forum.thread.resolved",
    defaultText: "Resolved",
    description: "Badge shown on threads marked as resolved.",
  },
  {
    key: "forum.thread.locked",
    defaultText: "Locked",
    description: "Badge shown on locked discussion threads.",
  },
  {
    key: "forum.thread.subscribed",
    defaultText: "Subscribed",
    description: "Badge shown when the viewer follows a thread.",
  },
  {
    key: "forum.thread.no_excerpt",
    defaultText: "This discussion does not include a preview yet.",
    description: "Fallback text when a thread lacks an excerpt.",
  },
  {
    key: "forum.thread.meta.replies",
    defaultText: "{count} replies",
    description: "Label displaying the number of replies on a thread.",
  },
  {
    key: "forum.thread.meta.views",
    defaultText: "{count} views",
    description: "Label displaying the number of views on a thread.",
  },
  {
    key: "forum.badge.official",
    defaultText: "Official",
    description: "Label shown on forum content posted by an administrator.",
  },
  {
    key: "forum.thread.relative.just_now",
    defaultText: "just now",
    description: "Fallback text for very recent timestamps.",
  },
  {
    key: "forum.thread.toast.reply_posted",
    defaultText: "Reply posted!",
    description: "Toast shown after a reply is successfully created.",
  },
  {
    key: "forum.thread.toast.resolve_success",
    defaultText: "Thread marked as solved.",
    description: "Toast shown after resolving a thread.",
  },
  {
    key: "forum.thread.toast.reopen_success",
    defaultText: "Thread reopened.",
    description: "Toast shown after reopening a thread.",
  },
  {
    key: "forum.thread.toast.delete_success",
    defaultText: "Thread deleted.",
    description: "Toast shown after deleting a thread.",
  },
  {
    key: "forum.thread.toast.action_error",
    defaultText: "Unable to update the thread. Please try again.",
    description: "Generic error shown when a thread action fails.",
  },
  {
    key: "forum.thread.toast.subscription_error",
    defaultText: "Unable to update subscription right now.",
    description: "Toast shown when following or unfollowing a thread fails.",
  },
  {
    key: "forum.thread.toast.reaction_error",
    defaultText: "Unable to update reaction.",
    description: "Toast shown when toggling a reaction fails.",
  },
  {
    key: "forum.thread.meta.started",
    defaultText: "Started {date}",
    description: "Label describing when the thread was created.",
  },
  {
    key: "forum.thread.meta.updated",
    defaultText: "Updated {timestamp}",
    description: "Label describing the last reply timestamp.",
  },
  {
    key: "forum.thread.action.follow",
    defaultText: "Follow",
    description: "Button text to subscribe to a thread.",
  },
  {
    key: "forum.thread.action.unfollow",
    defaultText: "Unfollow",
    description: "Button text to unsubscribe from a thread.",
  },
  {
    key: "forum.thread.action.updating",
    defaultText: "Updating…",
    description: "Label shown while the follow/unfollow action is pending.",
  },
  {
    key: "forum.thread.back_to_forum",
    defaultText: "Back to forum",
    description:
      "Button label that returns the viewer to the forum listing page.",
  },
  {
    key: "forum.thread.post.no_content",
    defaultText: "This post does not include any content.",
    description: "Fallback text when a reply has no body.",
  },
  {
    key: "forum.thread.replies.empty",
    defaultText: "No replies yet. Be the first to respond.",
    description:
      "Empty state message on the thread detail page when there are no replies.",
  },
  {
    key: "forum.thread.reaction.like",
    defaultText: "Helpful",
    description: "Label for the helpful reaction button.",
  },
  {
    key: "forum.thread.reaction.insightful",
    defaultText: "Insightful",
    description: "Label for the insightful reaction button.",
  },
  {
    key: "forum.thread.reaction.support",
    defaultText: "Support",
    description: "Label for the support reaction button.",
  },
  {
    key: "forum.thread.section.add_reply",
    defaultText: "Add a reply",
    description: "Heading above the reply composer on the thread detail view.",
  },
  {
    key: "forum.thread.reply.placeholder_signed_in",
    defaultText: "Share your insights, {name}…",
    description: "Placeholder shown in the reply composer for signed-in users.",
  },
  {
    key: "forum.thread.reply.placeholder_signed_out",
    defaultText: "Sign in to join the conversation.",
    description: "Placeholder shown when the viewer is logged out.",
  },
  {
    key: "forum.thread.reply.submit",
    defaultText: "Post reply",
    description: "Submit button text for the reply composer.",
  },
  {
    key: "forum.thread.reply.submit_pending",
    defaultText: "Posting…",
    description: "Button label while the reply submit request is pending.",
  },
  {
    key: "forum.thread.reply.error_too_short",
    defaultText: "Replies should be at least 8 characters.",
    description: "Validation error when a reply is too short.",
  },
  {
    key: "forum.thread.actions.menu",
    defaultText: "Thread actions",
    description: "Label for the thread actions dropdown menu.",
  },
  {
    key: "forum.thread.actions.resolve",
    defaultText: "Mark as solved",
    description: "Menu item to mark a thread as resolved.",
  },
  {
    key: "forum.thread.actions.reopen",
    defaultText: "Reopen discussion",
    description: "Menu item to reopen a resolved thread.",
  },
  {
    key: "forum.thread.actions.delete",
    defaultText: "Delete thread",
    description: "Menu item to delete a thread.",
  },
  {
    key: "forum.thread.actions.delete_confirm",
    defaultText:
      "Are you sure you want to delete this thread? This action cannot be undone.",
    description: "Confirmation message before deleting a thread.",
  },
  {
    key: "creator_dashboard.tagline",
    defaultText: "Creator dashboard",
    description: "Tagline shown at the top of the creator dashboard.",
  },
  {
    key: "creator_dashboard.title",
    defaultText: "Share coupons and track performance",
    description: "Main heading for the creator dashboard page.",
  },
  {
    key: "creator_dashboard.subtitle",
    defaultText:
      "Monitor how your community redeems coupons, how much revenue you helped generate, and when each code expires.",
    description: "Subtitle describing the creator dashboard.",
  },
  {
    key: "creator_dashboard.metrics.redemptions",
    defaultText: "Total redemptions",
    description:
      "Metric label indicating the total number of coupon redemptions.",
  },
  {
    key: "creator_dashboard.metrics.revenue",
    defaultText: "Recharge volume",
    description:
      "Metric label for total recharge revenue generated by coupons.",
  },
  {
    key: "creator_dashboard.metrics.savings",
    defaultText: "User savings",
    description: "Metric label showing the total discount unlocked for users.",
  },
  {
    key: "creator_dashboard.metrics.rewards",
    defaultText: "Your rewards",
    description: "Metric label summarising creator reward payouts.",
  },
  {
    key: "creator_dashboard.metrics.paid",
    defaultText: "Payouts completed",
    description: "Metric label for the total rewards already paid out.",
  },
  {
    key: "creator_dashboard.metrics.pending_payout",
    defaultText: "Pending payout",
    description: "Metric label for rewards awaiting payment.",
  },
  {
    key: "coupon.reward_status.pending",
    defaultText: "Payment pending",
    description: "Badge label when creator rewards are pending payment.",
  },
  {
    key: "coupon.reward_status.paid",
    defaultText: "Paid",
    description: "Badge label when creator rewards are paid.",
  },
  {
    key: "coupon.reward_status.none",
    defaultText: "No redemptions yet",
    description:
      "Helper text when rewards are unavailable due to zero redemptions.",
  },
  {
    key: "creator_dashboard.coupons.title",
    defaultText: "Your coupon codes",
    description: "Section title for the coupon table on the creator dashboard.",
  },
  {
    key: "creator_dashboard.coupons.subtitle",
    defaultText:
      "Review status, validity, and performance for every code assigned to you.",
    description: "Helper text beneath the coupon section heading.",
  },
  {
    key: "creator_dashboard.coupons.empty",
    defaultText:
      "No coupons are assigned to you yet. Once an admin shares a code, it will appear here.",
    description: "Empty-state text when a creator has no coupons.",
  },
  {
    key: "creator_dashboard.table.code",
    defaultText: "Code",
    description: "Table column label for the coupon code.",
  },
  {
    key: "creator_dashboard.table.discount",
    defaultText: "Discount",
    description: "Table column label for the coupon discount percentage.",
  },
  {
    key: "creator_dashboard.table.validity",
    defaultText: "Validity",
    description: "Table column label for coupon validity dates.",
  },
  {
    key: "creator_dashboard.table.status",
    defaultText: "Status",
    description: "Table column label for coupon status.",
  },
  {
    key: "creator_dashboard.table.usage",
    defaultText: "Usage",
    description: "Table column label for coupon redemption counts.",
  },
  {
    key: "creator_dashboard.table.revenue",
    defaultText: "Revenue",
    description: "Table column label for revenue generated per coupon.",
  },
  {
    key: "creator_dashboard.table.reward",
    defaultText: "Reward",
    description: "Table column label for creator reward percentage and payout.",
  },
  {
    key: "creator_dashboard.table.payouts",
    defaultText: "Payouts",
    description: "Table column label for paid vs pending rewards.",
  },
  {
    key: "creator_dashboard.payouts.pending",
    defaultText: "Pending {amount}",
    description: "Helper text indicating the remaining unpaid reward amount.",
  },
  {
    key: "creator_dashboard.table.no_end",
    defaultText: "No end date",
    description: "Helper text when a coupon has no expiration.",
  },
  {
    key: "creator_dashboard.status.expired",
    defaultText: "Expired",
    description: "Badge label for expired coupons.",
  },
  {
    key: "creator_dashboard.status.active",
    defaultText: "Active",
    description: "Badge label for active coupons.",
  },
  {
    key: "creator_dashboard.status.inactive",
    defaultText: "Inactive",
    description: "Badge label for inactive coupons.",
  },
  {
    key: "creator_dashboard.redemptions.title",
    defaultText: "Recent redemptions",
    description: "Section heading for the creator redemption history table.",
  },
  {
    key: "creator_dashboard.redemptions.subtitle",
    defaultText: "Track every subscription that used your coupon code.",
    description: "Helper text explaining the redemption history section.",
  },
  {
    key: "creator_dashboard.redemptions.empty",
    defaultText:
      "No redemptions are recorded yet. Share your code to see activity here.",
    description: "Empty-state message when no coupon redemptions exist.",
  },
  {
    key: "creator_dashboard.redemptions.user",
    defaultText: "User",
    description: "Table column label for the masked user identifier.",
  },
  {
    key: "creator_dashboard.redemptions.coupon",
    defaultText: "Coupon",
    description: "Table column label for the coupon code used in a redemption.",
  },
  {
    key: "creator_dashboard.redemptions.payment",
    defaultText: "Payment",
    description:
      "Table column label for the payment amount collected from the user.",
  },
  {
    key: "creator_dashboard.redemptions.discount",
    defaultText: "Discount",
    description:
      "Table column label for the discount applied to the redemption.",
  },
  {
    key: "creator_dashboard.redemptions.reward",
    defaultText: "Your reward",
    description:
      "Table column label for the creator reward amount per redemption.",
  },
  {
    key: "creator_dashboard.redemptions.date",
    defaultText: "Redeemed at",
    description: "Table column label for the redemption date.",
  },
  {
    key: "creator_dashboard.redemptions.sort.label",
    defaultText: "Sort by",
    description: "Label preceding the redemption sorting controls.",
  },
  {
    key: "creator_dashboard.redemptions.sort.newest",
    defaultText: "Newest",
    description: "Button label to sort redemptions by newest first.",
  },
  {
    key: "creator_dashboard.redemptions.sort.oldest",
    defaultText: "Oldest",
    description: "Button label to sort redemptions by oldest first.",
  },
  {
    key: "creator_dashboard.redemptions.sort.highest",
    defaultText: "Highest payment",
    description: "Button label to sort redemptions by highest payment first.",
  },
  {
    key: "creator_dashboard.redemptions.sort.lowest",
    defaultText: "Lowest payment",
    description: "Button label to sort redemptions by lowest payment first.",
  },
  {
    key: "creator_dashboard.redemptions.pagination",
    defaultText: "Page {current} of {total}",
    description: "Helper text describing the current pagination state.",
  },
  {
    key: "common.previous",
    defaultText: "Previous",
    description: "Label for pagination controls that go to the previous page.",
  },
  {
    key: "common.next",
    defaultText: "Next",
    description: "Label for pagination controls that go to the next page.",
  },
  {
    key: "creator_dashboard.table.last_used",
    defaultText: "Last: {date}",
    description: "Helper text showing the last redemption date for a coupon.",
  },
];
