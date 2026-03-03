"use client";

import { useMemo, useState } from "react";
import { JobsInfiniteList } from "@/components/jobs/jobs-infinite-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { JobListItem } from "@/lib/jobs/types";

type JobsModeListPanelProps = {
  jobs: JobListItem[];
  pauseAutoLoad?: boolean;
};

type JobsLocalFilters = {
  q: string;
  company: string;
  location: string;
  employmentType: string;
};

const EMPTY_FILTERS: JobsLocalFilters = {
  q: "",
  company: "",
  location: "",
  employmentType: "",
};

const normalizeFilter = (value: string) => value.trim().toLowerCase();

export function JobsModeListPanel({
  jobs,
  pauseAutoLoad = false,
}: JobsModeListPanelProps) {
  const [draftFilters, setDraftFilters] = useState<JobsLocalFilters>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<JobsLocalFilters>(EMPTY_FILTERS);

  const companies = useMemo(
    () => Array.from(new Set(jobs.map((job) => job.company.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [jobs]
  );
  const locations = useMemo(
    () => Array.from(new Set(jobs.map((job) => job.location.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [jobs]
  );
  const employmentTypes = useMemo(
    () =>
      Array.from(new Set(jobs.map((job) => job.employmentType.trim()).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b)
      ),
    [jobs]
  );

  const filteredJobs = useMemo(() => {
    const qFilter = normalizeFilter(appliedFilters.q);
    const companyFilter = normalizeFilter(appliedFilters.company);
    const locationFilter = normalizeFilter(appliedFilters.location);
    const employmentTypeFilter = normalizeFilter(appliedFilters.employmentType);

    return jobs.filter((job) => {
      if (companyFilter && normalizeFilter(job.company) !== companyFilter) {
        return false;
      }
      if (locationFilter && normalizeFilter(job.location) !== locationFilter) {
        return false;
      }
      if (employmentTypeFilter && normalizeFilter(job.employmentType) !== employmentTypeFilter) {
        return false;
      }
      if (!qFilter) {
        return true;
      }

      const haystack = [
        job.title,
        job.company,
        job.location,
        job.employmentType,
        job.descriptionSnippet,
        job.salaryLabel,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(qFilter);
    });
  }, [appliedFilters, jobs]);

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filter jobs</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6"
            onSubmit={(event) => {
              event.preventDefault();
              setAppliedFilters(draftFilters);
            }}
          >
            <input
              className="rounded-md border bg-background px-3 py-2 text-sm sm:col-span-2 lg:col-span-2"
              name="q"
              onChange={(event) => setDraftFilters((prev) => ({ ...prev, q: event.target.value }))}
              placeholder="Search title, company, location, or description"
              value={draftFilters.q}
            />
            <input
              className="rounded-md border bg-background px-3 py-2 text-sm"
              list="jobs-mode-company-options"
              name="company"
              onChange={(event) => setDraftFilters((prev) => ({ ...prev, company: event.target.value }))}
              placeholder="Company"
              value={draftFilters.company}
            />
            <input
              className="rounded-md border bg-background px-3 py-2 text-sm"
              list="jobs-mode-location-options"
              name="location"
              onChange={(event) => setDraftFilters((prev) => ({ ...prev, location: event.target.value }))}
              placeholder="Location"
              value={draftFilters.location}
            />
            <input
              className="rounded-md border bg-background px-3 py-2 text-sm"
              list="jobs-mode-employment-type-options"
              name="employmentType"
              onChange={(event) => setDraftFilters((prev) => ({ ...prev, employmentType: event.target.value }))}
              placeholder="Employment type"
              value={draftFilters.employmentType}
            />
            <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-6">
              <Button className="cursor-pointer" size="sm" type="submit">
                Apply filters
              </Button>
              <Button
                className="cursor-pointer"
                onClick={() => {
                  setDraftFilters(EMPTY_FILTERS);
                  setAppliedFilters(EMPTY_FILTERS);
                }}
                size="sm"
                type="button"
                variant="outline"
              >
                Reset
              </Button>
            </div>
          </form>

          <datalist id="jobs-mode-company-options">
            {companies.map((company) => (
              <option key={company} value={company} />
            ))}
          </datalist>
          <datalist id="jobs-mode-location-options">
            {locations.map((location) => (
              <option key={location} value={location} />
            ))}
          </datalist>
          <datalist id="jobs-mode-employment-type-options">
            {employmentTypes.map((employmentType) => (
              <option key={employmentType} value={employmentType} />
            ))}
          </datalist>
        </CardContent>
      </Card>

      <JobsInfiniteList jobs={filteredJobs} pauseAutoLoad={pauseAutoLoad} />
    </div>
  );
}
