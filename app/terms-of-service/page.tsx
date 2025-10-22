import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "Understand the terms and conditions that govern your use of Khasigpt.",
};

export default function TermsOfServicePage() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-8 px-6 py-12 md:py-16">
      <header className="space-y-2">
        <p className="text-sm font-medium text-primary">Khasigpt</p>
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
          Terms of Service
        </h1>
        <p className="text-muted-foreground">
          Last updated: {new Date().getFullYear()}
        </p>
      </header>

      <section className="space-y-4 text-sm leading-7 text-muted-foreground md:text-base md:leading-8">
        <p>
          These Terms of Service (&quot;Terms&quot;) govern your access to and
          use of Khasigpt. By creating an account or using the platform, you
          agree to comply with these Terms. If you do not agree, you may not use
          the service.
        </p>

        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-foreground">Account Responsibilities</h2>
          <p>
            You are responsible for safeguarding your account credentials and
            for any activity under your account. Notify us immediately of any
            unauthorized use. We may suspend or terminate accounts that violate
            these Terms or disrupt the service.
          </p>
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-foreground">Acceptable Use</h2>
          <p>
            You agree not to misuse Khasigpt, including uploading unlawful
            content, attempting to interfere with the service, or using the
            platform to infringe upon intellectual property rights. We reserve
            the right to remove content or restrict access at our discretion.
          </p>
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-foreground">Intellectual Property</h2>
          <p>
            Khasigpt retains ownership of the platform, including software,
            documentation, and branding. You retain ownership of content you
            create, but grant us a limited license to host and process it as
            needed to provide the service.
          </p>
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-foreground">Disclaimers</h2>
          <p>
            The service is provided on an &quot;as is&quot; basis without
            warranties of any kind. We do not guarantee that the platform will
            be uninterrupted or error-free. To the fullest extent permitted by
            law, Khasigpt is not liable for damages arising from your use of the
            service.
          </p>
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-foreground">Changes</h2>
          <p>
            We may modify these Terms from time to time. If changes are
            significant, we will provide notice through the app or by email.
            Continued use of the service after updates constitutes acceptance of
            the revised Terms.
          </p>
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-foreground">Contact</h2>
          <p>
            Questions about these Terms can be directed to{" "}
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
