import { http } from "./client";
import type { Project } from "../types/project";

export async function listProjects(): Promise<Project[]> {
  return http<Project[]>("/projects");
}

export async function createProject(input: Omit<Project, "id">): Promise<Project> {
  return http<Project>("/projects", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function deleteProject(id: number): Promise<void> {
  await http(`/projects/${id}`, { method: "DELETE" });
}
