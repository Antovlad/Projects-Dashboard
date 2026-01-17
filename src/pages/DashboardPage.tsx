import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createProject, deleteProject, listProjects } from "../api/projects";
import type { ProjectStatus } from "../types/project";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  PieChart,
  Pie,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts";

const schema = z.object({
  name: z.string().min(2, "Name too short"),
  owner: z.string().min(2, "Owner too short"),
  status: z.enum(["ACTIVE", "PAUSED", "DONE"]),
  budget: z.coerce.number().min(0),
  spent: z.coerce.number().min(0),
});

type FormValues = z.infer<typeof schema>;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function money(n: number) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "EUR" }).format(n);
}

function Card({ title, value, sub }: { title: string; value: string; sub?: string }) {
  return (
    <div style={{ border: "1px solid #eee", borderRadius: 14, padding: 14, background: "white" }}>
      <div style={{ color: "#666", fontSize: 13 }}>{title}</div>
      <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6 }}>{value}</div>
      {sub ? <div style={{ color: "#666", fontSize: 13, marginTop: 6 }}>{sub}</div> : null}
    </div>
  );
}

function Badge({ status }: { status: ProjectStatus }) {
  const map: Record<ProjectStatus, { bg: string; text: string }> = {
    ACTIVE: { bg: "#e8fff3", text: "#067647" },
    PAUSED: { bg: "#fff7ed", text: "#9a3412" },
    DONE: { bg: "#eef2ff", text: "#3730a3" },
  };
  const s = map[status];
  return (
    <span
      style={{
        padding: "4px 10px",
        borderRadius: 999,
        background: s.bg,
        color: s.text,
        fontSize: 12,
        fontWeight: 700,
        display: "inline-block",
      }}
    >
      {status}
    </span>
  );
}

// Custom tooltip ca să nu se mai suprapună urât peste chart
function BudgetTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number }>;
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;

  const budget = payload.find((p) => p.name === "budget")?.value ?? payload[0]?.value ?? 0;
  const spent = payload.find((p) => p.name === "spent")?.value ?? payload[1]?.value ?? 0;

  return (
    <div
      style={{
        background: "white",
        padding: "8px 12px",
        border: "1px solid #ddd",
        borderRadius: 8,
        maxWidth: 200,
        fontSize: 13,
        lineHeight: 1.4,
        boxShadow: "0 6px 24px rgba(0,0,0,0.08)",
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{label}</div>
      <div>budget: {money(budget)}</div>
      <div>spent: {money(spent)}</div>
    </div>
  );
}

export default function DashboardPage() {
  const qc = useQueryClient();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["projects"],
    queryFn: listProjects,
  });

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<ProjectStatus | "ALL">("ALL");
  const [sort, setSort] = useState<"createdAt" | "budget" | "spent">("createdAt");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const pageSize = 6;

  const filteredSorted = useMemo(() => {
    const items = (data ?? []).slice();

    const qq = q.trim().toLowerCase();
    const filtered = items.filter((p) => {
      const matchesQ =
        !qq ||
        p.name.toLowerCase().includes(qq) ||
        p.owner.toLowerCase().includes(qq) ||
        String(p.id).includes(qq);
      const matchesStatus = status === "ALL" || p.status === status;
      return matchesQ && matchesStatus;
    });

    filtered.sort((a, b) => {
      const av =
        sort === "createdAt"
          ? new Date(a.createdAt).getTime()
          : sort === "budget"
          ? a.budget
          : a.spent;
      const bv =
        sort === "createdAt"
          ? new Date(b.createdAt).getTime()
          : sort === "budget"
          ? b.budget
          : b.spent;

      return dir === "asc" ? av - bv : bv - av;
    });

    return filtered;
  }, [data, q, status, sort, dir]);

  const totalPages = Math.max(1, Math.ceil(filteredSorted.length / pageSize));
  const safePage = clamp(page, 1, totalPages);
  const pageItems = filteredSorted.slice((safePage - 1) * pageSize, safePage * pageSize);

  const kpis = useMemo(() => {
    const items = filteredSorted;
    const totalBudget = items.reduce((s, p) => s + p.budget, 0);
    const totalSpent = items.reduce((s, p) => s + p.spent, 0);
    const active = items.filter((p) => p.status === "ACTIVE").length;
    const burn = totalBudget <= 0 ? 0 : Math.round((totalSpent / totalBudget) * 100);
    return { totalBudget, totalSpent, active, burn };
  }, [filteredSorted]);

  const statusPie = useMemo(() => {
    const counts = { ACTIVE: 0, PAUSED: 0, DONE: 0 };
    for (const p of filteredSorted) counts[p.status]++;
    return [
      { name: "ACTIVE", value: counts.ACTIVE },
      { name: "PAUSED", value: counts.PAUSED },
      { name: "DONE", value: counts.DONE },
    ];
  }, [filteredSorted]);

  const budgetBars = useMemo(() => {
    // top 6 by budget
    return filteredSorted
      .slice()
      .sort((a, b) => b.budget - a.budget)
      .slice(0, 6)
      .map((p) => ({ name: p.name, budget: p.budget, spent: p.spent }));
  }, [filteredSorted]);

  const createMut = useMutation({
    mutationFn: createProject,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  const delMut = useMutation({
    mutationFn: deleteProject,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      owner: "Antoniu",
      status: "ACTIVE",
      budget: 0,
      spent: 0,
    },
  });

  function onSubmit(values: FormValues) {
    const createdAt = new Date().toISOString().slice(0, 10);
    createMut.mutate({
      name: values.name,
      owner: values.owner,
      status: values.status,
      budget: values.budget,
      spent: Math.min(values.spent, values.budget),
      createdAt,
    });
    form.reset({ name: "", owner: values.owner, status: "ACTIVE", budget: 0, spent: 0 });
  }

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: 24, fontFamily: "system-ui" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Projects Dashboard</h1>
          <div style={{ color: "#666", marginTop: 6 }}>
            React + TypeScript • TanStack Query • Forms + Validation • Charts
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Search by name / owner / id..."
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
              width: 280,
            }}
          />

          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as any);
              setPage(1);
            }}
            style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb" }}
          >
            <option value="ALL">All statuses</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="PAUSED">PAUSED</option>
            <option value="DONE">DONE</option>
          </select>

          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as any)}
            style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb" }}
          >
            <option value="createdAt">Sort: created date</option>
            <option value="budget">Sort: budget</option>
            <option value="spent">Sort: spent</option>
          </select>

          <button
            onClick={() => setDir((d) => (d === "asc" ? "desc" : "asc"))}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
              background: "white",
            }}
            title="Toggle sort direction"
          >
            {dir === "asc" ? "↑" : "↓"}
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: 12,
          marginTop: 18,
        }}
      >
        <Card title="Total Budget" value={money(kpis.totalBudget)} />
        <Card title="Total Spent" value={money(kpis.totalSpent)} />
        <Card title="Active Projects" value={String(kpis.active)} sub="Filter affects KPIs" />
        <Card title="Burn Rate" value={`${kpis.burn}%`} sub="spent / budget" />
      </div>

      {/* Main grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr",
          gap: 12,
          marginTop: 12,
          alignItems: "start",
        }}
      >
        {/* Table */}
        <div style={{ border: "1px solid #eee", borderRadius: 14, padding: 14, background: "white" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <h2 style={{ margin: 0 }}>Projects</h2>
            <div style={{ color: "#666", fontSize: 13 }}>
              Showing {filteredSorted.length} • Page {safePage}/{totalPages}
            </div>
          </div>

          {isLoading ? (
            <div style={{ padding: 18, color: "#666" }}>Loading...</div>
          ) : isError ? (
            <div style={{ padding: 18, color: "#b91c1c" }}>
              Failed to load projects: {(error as any)?.message || String(error)}
            </div>
          ) : pageItems.length === 0 ? (
            <div style={{ padding: 18, color: "#666" }}>No projects match your filters.</div>
          ) : (
            <div style={{ marginTop: 12, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "#666", fontSize: 13 }}>
                    <th style={{ padding: "10px 8px", borderBottom: "1px solid #eee" }}>Name</th>
                    <th style={{ padding: "10px 8px", borderBottom: "1px solid #eee" }}>Owner</th>
                    <th style={{ padding: "10px 8px", borderBottom: "1px solid #eee" }}>Status</th>
                    <th style={{ padding: "10px 8px", borderBottom: "1px solid #eee" }}>Budget</th>
                    <th style={{ padding: "10px 8px", borderBottom: "1px solid #eee" }}>Spent</th>
                    <th style={{ padding: "10px 8px", borderBottom: "1px solid #eee" }}>Created</th>
                    <th style={{ padding: "10px 8px", borderBottom: "1px solid #eee" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((p) => (
                    <tr key={p.id}>
                      <td style={{ padding: "10px 8px", borderBottom: "1px solid #f3f4f6", fontWeight: 700 }}>
                        {p.name}
                      </td>
                      <td style={{ padding: "10px 8px", borderBottom: "1px solid #f3f4f6" }}>{p.owner}</td>
                      <td style={{ padding: "10px 8px", borderBottom: "1px solid #f3f4f6" }}>
                        <Badge status={p.status} />
                      </td>
                      <td style={{ padding: "10px 8px", borderBottom: "1px solid #f3f4f6" }}>{money(p.budget)}</td>
                      <td style={{ padding: "10px 8px", borderBottom: "1px solid #f3f4f6" }}>{money(p.spent)}</td>
                      <td style={{ padding: "10px 8px", borderBottom: "1px solid #f3f4f6" }}>{p.createdAt}</td>
                      <td style={{ padding: "10px 8px", borderBottom: "1px solid #f3f4f6" }}>
                        <button
                          onClick={() => delMut.mutate(p.id)}
                          disabled={delMut.isPending}
                          style={{
                            padding: "8px 10px",
                            borderRadius: 10,
                            border: "1px solid #eee",
                            background: "white",
                            cursor: "pointer",
                          }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #eee", background: "white" }}
            >
              Prev
            </button>

            <div style={{ color: "#666", fontSize: 13 }}>
              Page {safePage} of {totalPages}
            </div>

            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #eee", background: "white" }}
            >
              Next
            </button>
          </div>
        </div>

        {/* Right column: Create + charts */}
        <div style={{ display: "grid", gap: 12 }}>
          {/* Create form */}
          <div style={{ border: "1px solid #eee", borderRadius: 14, padding: 14, background: "white" }}>
            <h2 style={{ marginTop: 0 }}>Create project</h2>

            <form onSubmit={form.handleSubmit(onSubmit)} style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <label>Name</label>
                <input
                  {...form.register("name")}
                  style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb" }}
                />
                {form.formState.errors.name?.message ? (
                  <div style={{ color: "#b91c1c", fontSize: 12 }}>{form.formState.errors.name.message}</div>
                ) : null}
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                <label>Owner</label>
                <input
                  {...form.register("owner")}
                  style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb" }}
                />
                {form.formState.errors.owner?.message ? (
                  <div style={{ color: "#b91c1c", fontSize: 12 }}>{form.formState.errors.owner.message}</div>
                ) : null}
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                <label>Status</label>
                <select
                  {...form.register("status")}
                  style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb" }}
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="PAUSED">PAUSED</option>
                  <option value="DONE">DONE</option>
                </select>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div style={{ display: "grid", gap: 6 }}>
                  <label>Budget</label>
                  <input
                    type="number"
                    step="1"
                    {...form.register("budget")}
                    style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb" }}
                  />
                  {form.formState.errors.budget?.message ? (
                    <div style={{ color: "#b91c1c", fontSize: 12 }}>{form.formState.errors.budget.message}</div>
                  ) : null}
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <label>Spent</label>
                  <input
                    type="number"
                    step="1"
                    {...form.register("spent")}
                    style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb" }}
                  />
                  {form.formState.errors.spent?.message ? (
                    <div style={{ color: "#b91c1c", fontSize: 12 }}>{form.formState.errors.spent.message}</div>
                  ) : null}
                </div>
              </div>

              <button
                type="submit"
                disabled={createMut.isPending}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #111827",
                  background: "#111827",
                  color: "white",
                  cursor: "pointer",
                }}
              >
                {createMut.isPending ? "Creating..." : "Create"}
              </button>

              {createMut.isError ? (
                <div style={{ color: "#b91c1c", fontSize: 12 }}>
                  {(createMut.error as any)?.message || "Failed to create"}
                </div>
              ) : null}
            </form>
          </div>

          {/* Charts */}
          <div style={{ border: "1px solid #eee", borderRadius: 14, padding: 14, background: "white" }}>
            <h2 style={{ marginTop: 0 }}>Charts</h2>

            <div style={{ height: 180 }}>
              <div style={{ fontSize: 13, color: "#666", marginBottom: 8 }}>Status distribution</div>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusPie} dataKey="value" nameKey="name" outerRadius={70} />
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div style={{ height: 240, marginTop: 14 }}>
              <div style={{ fontSize: 13, color: "#666", marginBottom: 8 }}>Top budgets (budget vs spent)</div>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={budgetBars}
                  margin={{ top: 24, right: 56, left: 10, bottom: 40 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} interval={0} />
                  <YAxis />
                  <Tooltip content={<BudgetTooltip />} />
                  <Legend />
                  <Bar dataKey="budget" />
                  <Bar dataKey="spent" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div style={{ color: "#666", fontSize: 12, marginTop: 8 }}>
              Charts update with filters/search because they are computed from the same dataset.
            </div>
          </div>
        </div>
      </div>

      <div style={{ color: "#666", fontSize: 12, marginTop: 14 }}>
        API: json-server on <code>http://localhost:8081</code> • Data via TanStack Query
      </div>
    </div>
  );
}
