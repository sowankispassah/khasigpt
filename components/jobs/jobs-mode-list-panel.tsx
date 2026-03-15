"use client";

import { Search, X } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { JobsInfiniteList } from "@/components/jobs/jobs-infinite-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { JobListItem } from "@/lib/jobs/types";
import { cn } from "@/lib/utils";

type JobsModeListPanelProps = {
  isLoading?: boolean;
  jobs: JobListItem[];
};

type JobsLocalFilters = {
  q: string;
  company: string;
  location: string;
  type: string;
};

const EMPTY_FILTERS: JobsLocalFilters = {
  q: "",
  company: "",
  location: "",
  type: "",
};

const ALL_COMPANIES_VALUE = "__all_companies__";
const ALL_LOCATIONS_VALUE = "__all_locations__";
const ALL_TYPES_VALUE = "__all_types__";

const normalizeFilter = (value: string) => value.trim().toLowerCase();

type JobsFilterSelectProps = {
  allLabel: string;
  allValue: string;
  label: string;
  onValueChange: (value: string) => void;
  options: string[];
  value: string;
};

function JobsFilterSelect({
  allLabel,
  allValue,
  label,
  onValueChange,
  options,
  value,
}: JobsFilterSelectProps) {
  return (
    <Select
      onValueChange={(nextValue) =>
        onValueChange(nextValue === allValue ? "" : nextValue)
      }
      value={value || allValue}
    >
      <SelectTrigger
        aria-label={label}
        className={cn(
          "h-8 min-w-[112px] rounded-full border-border/70 bg-background/90 px-2.5 text-[11px] shadow-none sm:h-10 sm:min-w-[152px] sm:px-4 sm:text-sm",
          "focus:ring-1 focus:ring-ring focus:ring-offset-0"
        )}
      >
        <SelectValue placeholder={allLabel} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={allValue}>{allLabel}</SelectItem>
        {options.map((option) => (
          <SelectItem key={`${label}-${option}`} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function JobsModeListPanel({
  isLoading = false,
  jobs,
}: JobsModeListPanelProps) {
  const [filters, setFilters] = useState<JobsLocalFilters>(EMPTY_FILTERS);
  const deferredFilters = useDeferredValue(filters);

  const companies = useMemo(
    () => Array.from(new Set(jobs.map((job) => job.company.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [jobs]
  );
  const locations = useMemo(
    () => Array.from(new Set(jobs.map((job) => job.location.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [jobs]
  );
  const types = useMemo(
    () =>
      Array.from(new Set(jobs.map((job) => job.employmentType.trim()).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b)
      ),
    [jobs]
  );

  const filteredJobs = useMemo(() => {
    const qFilter = normalizeFilter(deferredFilters.q);
    const companyFilter = normalizeFilter(deferredFilters.company);
    const locationFilter = normalizeFilter(deferredFilters.location);
    const typeFilter = normalizeFilter(deferredFilters.type);

    return jobs.filter((job) => {
      if (companyFilter && normalizeFilter(job.company) !== companyFilter) {
        return false;
      }
      if (locationFilter && normalizeFilter(job.location) !== locationFilter) {
        return false;
      }
      if (typeFilter && normalizeFilter(job.employmentType) !== typeFilter) {
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
  }, [deferredFilters, jobs]);

  const hasActiveFilters = useMemo(
    () =>
      Object.values(filters).some(
        (value) => typeof value === "string" && value.trim().length > 0
      ),
    [filters]
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="rounded-[28px] border border-border/60 bg-gradient-to-br from-background via-background to-muted/35 p-3 shadow-sm sm:p-4">
          <div className="flex flex-col gap-3">
            <div className="h-12 animate-pulse rounded-[22px] bg-muted/70" />
            <div className="flex gap-2">
              <div className="h-10 w-32 animate-pulse rounded-full bg-muted/70" />
              <div className="h-10 w-32 animate-pulse rounded-full bg-muted/70" />
              <div className="h-10 w-32 animate-pulse rounded-full bg-muted/70" />
            </div>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((item) => (
            <div
              className="rounded-[28px] border border-border/60 p-5 shadow-sm"
              key={item}
            >
              <div className="space-y-3">
                <div className="h-4 w-1/3 animate-pulse rounded bg-muted/70" />
                <div className="h-6 w-4/5 animate-pulse rounded bg-muted/70" />
                <div className="h-12 animate-pulse rounded-[20px] bg-muted/70" />
                <div className="h-10 animate-pulse rounded-[20px] bg-muted/70" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-[28px] border border-border/60 bg-gradient-to-br from-background via-background to-muted/35 p-3 shadow-sm sm:p-4">
        <div className="flex flex-col gap-1.5 sm:gap-3">
          <label
            className={cn(
              "group flex items-center gap-3 rounded-[22px] border border-border/70 bg-background/90 px-4 py-3 shadow-sm",
              "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-0"
            )}
          >
            <Search className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-focus-within:text-foreground" />
            <Input
              autoComplete="off"
              className="h-auto border-0 bg-transparent px-0 py-0 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
              name="q"
              onChange={(event) =>
                setFilters((previous) => ({
                  ...previous,
                  q: event.target.value,
                }))
              }
              placeholder="Search jobs by title, company, location, or salary"
              role="searchbox"
              value={filters.q}
            />
          </label>

          <div className="-mx-1 overflow-x-auto pb-1">
            <div className="flex min-w-max items-center gap-1 px-1 sm:gap-2">
              <JobsFilterSelect
                allLabel="All companies"
                allValue={ALL_COMPANIES_VALUE}
                label="Company"
                onValueChange={(company) =>
                  setFilters((previous) => ({ ...previous, company }))
                }
                options={companies}
                value={filters.company}
              />
              <JobsFilterSelect
                allLabel="All locations"
                allValue={ALL_LOCATIONS_VALUE}
                label="Location"
                onValueChange={(location) =>
                  setFilters((previous) => ({ ...previous, location }))
                }
                options={locations}
                value={filters.location}
              />
              <JobsFilterSelect
                allLabel="All job types"
                allValue={ALL_TYPES_VALUE}
                label="Job type"
                onValueChange={(type) =>
                  setFilters((previous) => ({ ...previous, type }))
                }
                options={types}
                value={filters.type}
              />
              {hasActiveFilters ? (
                <Button
                  className="h-8 rounded-full border-border/70 px-3 text-[11px] sm:h-9 sm:px-4 sm:text-xs"
                  onClick={() => setFilters(EMPTY_FILTERS)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <X className="h-3.5 w-3.5" />
                  Reset
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
      <JobsInfiniteList jobs={filteredJobs} />
    </div>
  );
}
