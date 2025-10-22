import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Learn how Khasigpt collects, uses, and protects your personal information.",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-8 px-6 py-12 md:py-16">
      <header className="space-y-2">
        <p className="text-sm font-medium text-primary">Khasigpt</p>
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
          Privacy Policy
        </h1>
        <p className="text-muted-foreground">
          Last updated: {new Date().getFullYear()}
        </p>
      </header>

      <section className="space-y-4 text-sm leading-7 text-muted-foreground md:text-base md:leading-8">
        <p>
          Khasigpt is committed to safeguarding your privacy. This Privacy
          Policy explains what information we collect, how we use it, and the
          choices you have regarding your personal data. By using our services,
          you agree to the practices described here.
        </p>

        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-foreground">Information We Collect</h2>
          <p>
            We collect information you provide directly to us, such as your
            account details, messages, documents, and feedback. We also gather
            usage data generated while interacting with the platform, including
            device information, log data, and diagnostic reports.
          </p>
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-foreground">How We Use Information</h2>
          <p>
            The information we collect allows us to deliver, maintain, and
            improve the product. We use data to authenticate users, provide
            support, enhance AI generated responses, and communicate important
            updates. We never sell your personal information to third parties.
          </p>
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-foreground">
            Data Sharing and Retention
          </h2>
          <p>
            We may share data with trusted service providers who assist in
            hosting, email delivery, payments, and analytics. These partners are
            contractually required to process information in accordance with our
            instructions. We retain personal data only for as long as necessary
            to fulfill the purposes outlined in this policy or as required by
            law.
          </p>
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-foreground">Your Choices</h2>
          <p>
            You can access and update your profile information from your account
            settings. If you would like to delete your account or request a copy
            of your data, contact us using the support channels inside the app.
            We will respond within a reasonable timeframe.
          </p>
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-foreground">Contact Us</h2>
          <p>
            If you have questions about this Privacy Policy or our data
            practices, please reach out to{" "}
            <a className="text-primary underline" href="mailto:support@khasigpt.com">
              support@khasigpt.com
            </a>
            .
          </p>
        </div>
      </section>
    </div>
  );
}
