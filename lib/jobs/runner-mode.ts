import "server-only";

import { JOBS_SCRAPE_RUNNER_MODE_SETTING_KEY } from "@/lib/constants";
import { getAppSettingUncached } from "@/lib/db/queries";
import {
  type JobsScrapeRunnerMode,
  parseJobsScrapeRunnerMode,
} from "@/lib/jobs/schedule";

export async function getJobsScrapeRunnerModeUncached(): Promise<JobsScrapeRunnerMode> {
  const value = await getAppSettingUncached<unknown>(JOBS_SCRAPE_RUNNER_MODE_SETTING_KEY);
  return parseJobsScrapeRunnerMode(value);
}
