export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
};

export type RootStackParamList = {
  Auth: undefined;
  JobDetails: { id: string };
  Main: undefined;
  LaunchGate: undefined;
};

export type MainTabParamList = {
  Chat: { chatId?: string; newChat?: boolean } | undefined;
  Translate: undefined;
  Jobs: { chatId?: string; openAsk?: boolean } | undefined;
  Study: undefined;
  Calculator: undefined;
  Forum: undefined;
  Subscriptions: undefined;
  Recharge: undefined;
  Profile: undefined;
  About: undefined;
  Contact: undefined;
  PrivacyPolicy: undefined;
  TermsOfService: undefined;
};
