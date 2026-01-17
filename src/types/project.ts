export type ProjectStatus = "ACTIVE" | "PAUSED" | "DONE";

export type Project = {
  id: number;
  name: string;
  status: ProjectStatus;
  owner: string;
  budget: number;
  spent: number;
  createdAt: string; // YYYY-MM-DD
};
