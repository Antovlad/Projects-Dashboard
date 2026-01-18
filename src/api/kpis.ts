import type { Project } from "../types/project";

export type KPI = {
  label: string;
  value: string | number;
};

const formatEUR = (n: number) =>
  new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(n);

export function calculateKPIs(projects: Project[]): KPI[] {
  const totalBudget = projects.reduce((s, p) => s + (p.budget ?? 0), 0);
  const totalSpent = projects.reduce((s, p) => s + (p.spent ?? 0), 0);
  const activeCount = projects.filter((p) => p.status === "ACTIVE").length;

  const burnRate = totalBudget <= 0 ? 0 : Math.round((totalSpent / totalBudget) * 100);

  return [
    { label: "Total Budget", value: formatEUR(totalBudget) },
    { label: "Total Spent", value: formatEUR(totalSpent) },
    { label: "Active Projects", value: activeCount },
    { label: "Burn Rate", value: `${burnRate}%` },
  ];
}
