export const FORUM_REPORT_SUBJECTS = ["forum content report"] as const;
export const CHAT_REPORT_SUBJECTS = ["ai content report", "ai response feedback"] as const;

export type ReportSource = "chat" | "forum" | "other";

export function reportSourceFromSubject(subject: string): ReportSource {
  const normalized = subject.trim().toLowerCase();
  if (FORUM_REPORT_SUBJECTS.some((item) => item === normalized)) return "forum";
  if (CHAT_REPORT_SUBJECTS.some((item) => item === normalized)) return "chat";
  return "other";
}
