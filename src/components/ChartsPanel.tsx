import React, { useMemo } from "react";
import type { Project, ProjectStatus } from "../types/project";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts";

type Props = {
  projects: Project[];
};

const formatEUR = (n: number) =>
  new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
  }).format(n);

function formatShortName(name: string, max = 14) {
  if (!name) return "";
  return name.length <= max ? name : name.slice(0, max - 1) + "…";
}

function countByStatus(projects: Project[]) {
  const map: Record<ProjectStatus, number> = {
    ACTIVE: 0,
    PAUSED: 0,
    DONE: 0,
  };
  for (const p of projects) map[p.status] = (map[p.status] ?? 0) + 1;
  return [
    { name: "ACTIVE", value: map.ACTIVE },
    { name: "PAUSED", value: map.PAUSED },
    { name: "DONE", value: map.DONE },
  ];
}

export default function ChartsPanel({ projects }: Props) {
  const topBudget = useMemo(() => {
    return [...projects]
      .sort((a, b) => (b.budget ?? 0) - (a.budget ?? 0))
      .slice(0, 6)
      .map((p) => ({
        id: p.id,
        name: p.name,
        budget: Number(p.budget ?? 0),
        spent: Number(p.spent ?? 0),
      }));
  }, [projects]);

  const statusData = useMemo(() => countByStatus(projects), [projects]);

  const hasAny = projects.length > 0;

  return (
    <div style={{ marginTop: 24 }}>
      <h2 style={{ margin: "16px 0 8px", fontSize: 22 }}>Charts</h2>
      <p style={{ marginTop: 0, color: "#667085" }}>
        Charts update with filters/search because they are computed from the same dataset.
      </p>

      {!hasAny ? (
        <div
          style={{
            border: "1px solid #EAECF0",
            borderRadius: 12,
            padding: 16,
            color: "#667085",
            background: "#fff",
          }}
        >
          No data to display yet.
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.4fr 1fr",
            gap: 16,
            alignItems: "stretch",
          }}
        >
          <div
            style={{
              border: "1px solid #EAECF0",
              borderRadius: 12,
              padding: 16,
              background: "#fff",
              minHeight: 340,
              overflow: "visible",
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 8 }}>
              Top budgets (budget vs spent)
            </div>

            <div style={{ width: "100%", height: 280, overflow: "visible" }}>
              <ResponsiveContainer>
                <BarChart data={topBudget} margin={{ top: 10, right: 20, left: 0, bottom: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="name"
                    tickFormatter={(v) => formatShortName(String(v))}
                    interval={0}
                    angle={0}
                    height={36}
                  />
                  <YAxis tickFormatter={(v) => `${v}`} />
                  <Tooltip
                    wrapperStyle={{ zIndex: 50 }}
                    contentStyle={{
                      borderRadius: 10,
                      border: "1px solid #EAECF0",
                      boxShadow: "0 10px 30px rgba(16,24,40,0.12)",
                      background: "white",
                    }}
                    formatter={(value: any, name: any) => [
                      formatEUR(Number(value ?? 0)),
                      String(name),
                    ]}
                    labelFormatter={(label) => String(label)}
                    cursor={{ fillOpacity: 0.08 }}
                  />
                  <Legend />
                  <Bar dataKey="budget" />
                  <Bar dataKey="spent" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div
            style={{
              border: "1px solid #EAECF0",
              borderRadius: 12,
              padding: 16,
              background: "#fff",
              minHeight: 340,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Status breakdown</div>

            <div style={{ width: "100%", height: 280 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Tooltip
                    wrapperStyle={{ zIndex: 50 }}
                    contentStyle={{
                      borderRadius: 10,
                      border: "1px solid #EAECF0",
                      boxShadow: "0 10px 30px rgba(16,24,40,0.12)",
                      background: "white",
                    }}
                  />
                  <Legend />
                  <Pie
                    data={statusData}
                    dataKey="value"
                    nameKey="name"
                    outerRadius={90}
                    innerRadius={45}
                    paddingAngle={2}
                  >
                    {statusData.map((_, idx) => (
                      <Cell key={idx} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
