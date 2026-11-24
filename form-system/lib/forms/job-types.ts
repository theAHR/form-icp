import jobTypesJson from "./data/job-types.json";

export const jobTypes = jobTypesJson as string[];
export const jobTypeSet = new Set(jobTypes);

export function isJobType(value: string) {
  return jobTypeSet.has(value);
}
