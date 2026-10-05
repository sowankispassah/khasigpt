import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JobsInfiniteList } from "@/components/jobs/jobs-infinite-list";
import type { JobListItem } from "@/lib/jobs/types";

const jobs: JobListItem[] = Array.from({ length: 40 }, (_, index) => ({
  id: `job-${index}`, title: `Job ${index}`, company: "Government", location: "Shillong", employmentType: "government",
  salaryLabel: "Not disclosed", notificationDateLabel: "Today", fetchedOnLabel: "Today", sourceLabel: "Source", descriptionSnippet: "Description", hasPdfFile: false,
}));
const router = { bfcacheId: "jobs-list-test", back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {} };
const render = (items: JobListItem[]) => renderToStaticMarkup(createElement(AppRouterContext.Provider, { value: router },
  createElement(JobsInfiniteList, { jobs: items, visibleCount: 36, onVisibleCountChange() {} })));
console.log(JSON.stringify({
  expanded: render(jobs).includes("Job 35"),
  paginated: !render(jobs).includes("Job 36"),
  afterReplacement: render(jobs.map((job) => ({ ...job }))).includes("Job 35"),
  shorterResult: render(jobs.slice(0, 9)).includes("Job 8"),
}));
