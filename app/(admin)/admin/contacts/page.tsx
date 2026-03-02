import { formatDistanceToNow } from "date-fns";
import type { Metadata } from "next";

import { listContactMessages } from "@/lib/db/queries";
import type { ContactMessage } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Contact Requests",
  description: "Review messages submitted through the contact form.",
};

export default async function AdminContactsPage() {
  let messages: ContactMessage[] = [];

  try {
    messages = await listContactMessages({ limit: 100 });
  } catch (error) {
    console.error("Failed to load contact messages", error);
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-semibold text-2xl">Contact requests</h1>
        <p className="text-muted-foreground text-sm">
          Messages submitted through the public contact form.
        </p>
      </header>

      <section className="rounded-lg border bg-card p-4 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground text-xs uppercase">
              <tr>
                <th className="py-2 text-left">From</th>
                <th className="py-2 text-left">Phone</th>
                <th className="py-2 text-left">Subject</th>
                <th className="py-2 text-left">Received</th>
                <th className="py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {messages.length === 0 ? (
                <tr>
                  <td
                    className="py-8 text-center text-muted-foreground"
                    colSpan={5}
                  >
                    No contact requests yet.
                  </td>
                </tr>
              ) : (
                messages.map((message) => (
                  <tr className="border-t" key={message.id}>
                    <td className="py-3 align-top">
                      <div className="font-medium">{message.name}</div>
                      <a
                        className="text-muted-foreground text-xs hover:underline"
                        href={`mailto:${message.email}`}
                      >
                        {message.email}
                      </a>
                    </td>
                    <td className="py-3 align-top text-muted-foreground text-xs">
                      {message.phone ? (
                        <a
                          className="hover:underline"
                          href={`tel:${message.phone}`}
                        >
                          {message.phone}
                        </a>
                      ) : (
                        <span className="text-muted-foreground/70">N/A</span>
                      )}
                    </td>
                    <td className="py-3 align-top">
                      <div className="font-medium">{message.subject}</div>
                      <p className="line-clamp-2 text-muted-foreground text-xs leading-relaxed">
                        {message.message}
                      </p>
                    </td>
                    <td className="py-3 align-top text-muted-foreground">
                      {formatDistanceToNow(new Date(message.createdAt), {
                        addSuffix: true,
                      })}
                    </td>
                    <td className="py-3 align-top capitalize">
                      {message.status.replaceAll("_", " ")}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
