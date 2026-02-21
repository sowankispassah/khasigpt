import { redirect } from "next/navigation";
import {
  createJobPostingAction,
  deleteJobPostingAction,
  updateJobPostingAction,
} from "@/app/(admin)/actions";
import { auth } from "@/app/(auth)/auth";
import { ActionSubmitButton } from "@/components/action-submit-button";
import { listJobPostingEntries } from "@/lib/jobs/service";

export const dynamic = "force-dynamic";

const STATUS_OPTIONS = ["active", "inactive", "archived"] as const;

async function createJobPostingFormAction(formData: FormData) {
  "use server";
  await createJobPostingAction(formData);
}

async function updateJobPostingFormAction(formData: FormData) {
  "use server";
  await updateJobPostingAction(formData);
}

export default async function AdminJobsPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    redirect("/");
  }

  const jobs = await listJobPostingEntries({ includeInactive: true });

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-lg border bg-card p-6 shadow-sm">
        <h2 className="font-semibold text-lg">Upload job posting</h2>
        <p className="mt-1 text-muted-foreground text-sm">
          Upload a PDF, DOCX, XLSX, JPEG, or PNG file. The content is extracted and stored in
          the same RAG ingestion pipeline used for Study documents.
        </p>
        <form action={createJobPostingFormAction} className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            Job title
            <input
              className="rounded-md border bg-background px-3 py-2 text-sm"
              name="jobTitle"
              placeholder="Software Engineer"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Company
            <input
              className="rounded-md border bg-background px-3 py-2 text-sm"
              name="company"
              placeholder="Acme Inc."
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Location
            <input
              className="rounded-md border bg-background px-3 py-2 text-sm"
              name="location"
              placeholder="Shillong / Remote"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Employment type
            <input
              className="rounded-md border bg-background px-3 py-2 text-sm"
              name="employmentType"
              placeholder="Full-time"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Study exam
            <input
              className="rounded-md border bg-background px-3 py-2 text-sm"
              name="studyExam"
              placeholder="SSC CGL"
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Study role
            <input
              className="rounded-md border bg-background px-3 py-2 text-sm"
              name="studyRole"
              placeholder="Inspector"
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-sm md:col-span-2">
            Study years (comma separated, optional)
            <input
              className="rounded-md border bg-background px-3 py-2 text-sm"
              name="studyYears"
              placeholder="2023,2022,2021"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm md:col-span-2">
            Study tags (comma separated, optional)
            <input
              className="rounded-md border bg-background px-3 py-2 text-sm"
              name="studyTags"
              placeholder="quant,reasoning,current affairs"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm md:col-span-2">
            Tags (comma separated)
            <input
              className="rounded-md border bg-background px-3 py-2 text-sm"
              name="tags"
              placeholder="engineering,backend,remote"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Status
            <select
              className="rounded-md border bg-background px-3 py-2 text-sm"
              defaultValue="active"
              name="status"
            >
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            File
            <input
              accept=".pdf,.docx,.xlsx,.jpg,.jpeg,.png,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/jpeg,image/png"
              className="rounded-md border bg-background px-3 py-2 text-sm"
              name="file"
              required
              type="file"
            />
          </label>
          <div className="flex justify-end md:col-span-2">
            <ActionSubmitButton pendingLabel="Uploading...">
              Upload job posting
            </ActionSubmitButton>
          </div>
        </form>
      </section>

      <section className="rounded-lg border bg-card p-6 shadow-sm">
        <h2 className="font-semibold text-lg">Manage job postings</h2>
        <p className="mt-1 text-muted-foreground text-sm">
          Edit metadata, replace files, or remove postings.
        </p>

        <div className="mt-4 flex flex-col gap-4">
          {jobs.length === 0 ? (
            <p className="text-muted-foreground text-sm">No job postings uploaded yet.</p>
          ) : (
            jobs.map((job) => (
              <div className="rounded-lg border p-4" key={job.id}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-medium text-sm">{job.title}</div>
                    <div className="text-muted-foreground text-xs">
                      {job.company} / {job.location} / {job.employmentType}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      Study: {job.studyExam} / {job.studyRole}
                      {job.studyYears.length > 0
                        ? ` / ${job.studyYears.join(", ")}`
                        : ""}
                    </div>
                  </div>
                  <span className="rounded-full border px-2 py-0.5 text-xs">
                    {job.status}
                  </span>
                </div>

                <form action={updateJobPostingFormAction} className="grid gap-3 md:grid-cols-2">
                  <input name="id" type="hidden" value={job.id} />
                  <label className="flex flex-col gap-1 text-sm">
                    Job title
                    <input
                      className="rounded-md border bg-background px-3 py-2 text-sm"
                      defaultValue={job.title}
                      name="jobTitle"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    Company
                    <input
                      className="rounded-md border bg-background px-3 py-2 text-sm"
                      defaultValue={job.company}
                      name="company"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    Location
                    <input
                      className="rounded-md border bg-background px-3 py-2 text-sm"
                      defaultValue={job.location}
                      name="location"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    Employment type
                    <input
                      className="rounded-md border bg-background px-3 py-2 text-sm"
                      defaultValue={job.employmentType}
                      name="employmentType"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    Study exam
                    <input
                      className="rounded-md border bg-background px-3 py-2 text-sm"
                      defaultValue={job.studyExam}
                      name="studyExam"
                      required
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    Study role
                    <input
                      className="rounded-md border bg-background px-3 py-2 text-sm"
                      defaultValue={job.studyRole}
                      name="studyRole"
                      required
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm md:col-span-2">
                    Study years (comma separated, optional)
                    <input
                      className="rounded-md border bg-background px-3 py-2 text-sm"
                      defaultValue={job.studyYears.join(", ")}
                      name="studyYears"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm md:col-span-2">
                    Study tags (comma separated, optional)
                    <input
                      className="rounded-md border bg-background px-3 py-2 text-sm"
                      defaultValue={job.studyTags.join(", ")}
                      name="studyTags"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm md:col-span-2">
                    Tags (comma separated)
                    <input
                      className="rounded-md border bg-background px-3 py-2 text-sm"
                      defaultValue={job.tags.join(", ")}
                      name="tags"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    Status
                    <select
                      className="rounded-md border bg-background px-3 py-2 text-sm"
                      defaultValue={job.status}
                      name="status"
                    >
                      {STATUS_OPTIONS.map((status) => (
                        <option key={`${job.id}-${status}`} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    Replace file (optional)
                    <input
                      accept=".pdf,.docx,.xlsx,.jpg,.jpeg,.png,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/jpeg,image/png"
                      className="rounded-md border bg-background px-3 py-2 text-sm"
                      name="file"
                      type="file"
                    />
                  </label>
                  <div className="flex items-center justify-between gap-2 md:col-span-2">
                    <div className="text-muted-foreground text-xs">
                      Updated {job.updatedAt.toLocaleString()}
                    </div>
                    <ActionSubmitButton pendingLabel="Saving...">
                      Save changes
                    </ActionSubmitButton>
                  </div>
                </form>

                <form action={deleteJobPostingAction.bind(null, { id: job.id })} className="mt-2 flex justify-end">
                  <ActionSubmitButton pendingLabel="Deleting..." variant="destructive">
                    Delete posting
                  </ActionSubmitButton>
                </form>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
