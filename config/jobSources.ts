export type JobSourceSelectors = {
  jobContainer: string;
  title: string;
  location: string;
  company: string;
  link: string;
  description: string;
  publishedAt?: string;
};

export type JobSourceLocationScope = "meghalaya_only" | "all_locations";

export type JobSourceConfig = {
  name: string;
  url: string;
  selectors: JobSourceSelectors;
  locationScope?: JobSourceLocationScope;
};

// Keep selectors source-specific. Update these selectors whenever the source HTML changes.
export const jobSources: JobSourceConfig[] = [
  {
    name: "LinkedIn Meghalaya Shillong",
    url: "https://in.linkedin.com/jobs/search/?keywords=Shillong&location=Meghalaya",
    locationScope: "meghalaya_only",
    selectors: {
      jobContainer: "ul.jobs-search__results-list li",
      title: "h3.base-search-card__title",
      location: ".job-search-card__location",
      company: "h4.base-search-card__subtitle",
      link: "a.base-card__full-link",
      description: ".base-search-card__metadata, .job-search-card__snippet",
      publishedAt: "time",
    },
  },
  {
    name: "LinkedIn Meghalaya Tura",
    url: "https://in.linkedin.com/jobs/search/?keywords=Tura&location=Meghalaya",
    locationScope: "meghalaya_only",
    selectors: {
      jobContainer: "ul.jobs-search__results-list li",
      title: "h3.base-search-card__title",
      location: ".job-search-card__location",
      company: "h4.base-search-card__subtitle",
      link: "a.base-card__full-link",
      description: ".base-search-card__metadata, .job-search-card__snippet",
      publishedAt: "time",
    },
  },
  {
    name: "LinkedIn Meghalaya Jowai",
    url: "https://in.linkedin.com/jobs/search/?keywords=Jowai&location=Meghalaya",
    locationScope: "meghalaya_only",
    selectors: {
      jobContainer: "ul.jobs-search__results-list li",
      title: "h3.base-search-card__title",
      location: ".job-search-card__location",
      company: "h4.base-search-card__subtitle",
      link: "a.base-card__full-link",
      description: ".base-search-card__metadata, .job-search-card__snippet",
      publishedAt: "time",
    },
  },
];
