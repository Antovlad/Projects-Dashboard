import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import type { Project, ProjectStatus } from "../types/project";
import { calculateKPIs, type KPI } from "../api/kpis";
import ChartsPanel from "../components/ChartsPanel";

const API_URL = "http://localhost:8081/projects";

type SortKey = "createdAt" | "name" | "owner" | "budget" | "spent" | "status";
type SortDir = "asc" | "desc";

const statusOptions: Array<{ label: string; value: "ALL" | ProjectStatus }> = [
  { label: "All statuses", value: "ALL" },
  { label: "ACTIVE", value: "ACTIVE" },
  { label: "PAUSED", value: "PAUSED" },
  { label: "DONE", value: "DONE" },
];

const sortOptions: Array<{ label: string; value: SortKey }> = [
  { label: "created date", value: "createdAt" },
  { label: "name", value: "name" },
  { label: "owner", value: "owner" },
  { label: "status", value: "status" },
  { label: "budget", value: "budget" },
  { label: "spent", value: "spent" },
];

const projectSchema = z.object({
  name: z.string().trim().min(2, "Name is required (min 2 chars)"),
  owner: z.string().trim().min(2, "Owner is required (min 2 chars)"),
  status: z.enum(["ACTIVE", "PAUSED", "DONE"]),
  budget: z.coerce.number().min(0, "Budget must be >= 0"),
  spent: z.coerce.number().min(0, "Spent must be >= 0"),
  createdAt: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
});

type ProjectFormValues = z.infer<typeof projectSchema>;

const formatEUR = (n: number) =>
  new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(n);

function normalize(s: string) {
  return (s ?? "").toLowerCase().trim();
}

function compare(a: any, b: any) {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

export default function DashboardPage() {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | ProjectStatus>("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [page, setPage] = useState(1);
  const pageSize = 5;

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: async (): Promise<Project[]> => {
      const res = await fetch(API_URL);
      if (!res.ok) throw new Error(`Failed to fetch (${res.status})`);
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (payload: Omit<Project, "id">) => {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Create failed (${res.status})`);
      return (await res.json()) as Project;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${API_URL}/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Delete failed (${res.status})`);
      return true;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  const projects = projectsQuery.data ?? [];

  const filteredProjects = useMemo(() => {
    const q = normalize(query);

    let list = projects.filter((p) => {
      const matchesStatus = statusFilter === "ALL" ? true : p.status === statusFilter;

      if (!q) return matchesStatus;

      const hay = [
        p.name,
        p.owner,
        String(p.id),
        p.status,
        String(p.budget ?? ""),
        String(p.spent ?? ""),
        p.createdAt,
      ]
        .map(normalize)
        .join(" ");

      return matchesStatus && hay.includes(q);
    });

    list = list.sort((a, b) => {
      const av = (a as any)[sortKey];
      const bv = (b as any)[sortKey];
      const c = compare(av, bv);
      return sortDir === "asc" ? c : -c;
    });

    return list;
  }, [projects, query, statusFilter, sortKey, sortDir]);

  const kpis: KPI[] = useMemo(() => calculateKPIs(filteredProjects), [filteredProjects]);

  const totalPages = Math.max(1, Math.ceil(filteredProjects.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedProjects = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredProjects.slice(start, start + pageSize);
  }, [filteredProjects, safePage]);

  React.useEffect(() => {
    setPage(1);
  }, [query, statusFilter, sortKey, sortDir]);

  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const defaultDate = `${yyyy}-${mm}-${dd}`;

  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      name: "",
      owner: "Antoniu",
      status: "ACTIVE",
      budget: 0,
      spent: 0,
      createdAt: defaultDate,
    },
    mode: "onTouched",
  });

  const errorMsg = (projectsQuery.error as Error)?.message ?? (createMutation.error as Error)?.message ?? (deleteMutation.error as Error)?.message;

  const layoutStyles: React.CSSProperties = {
    maxWidth: 1120,
    margin: "0 auto",
    padding: "28px 16px 60px",
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
    color: "#0f172a",
  };

  const card: React.CSSProperties = {
    background: "#fff",
    border: "1px solid #EAECF0",
    borderRadius: 14,
    boxShadow: "0 1px 2px rgba(16, 24, 40, 0.06)",
  };

  const subtle: React.CSSProperties = { color: "#667085" };

  return (
    <div style={layoutStyles}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 54, lineHeight: 1.05, margin: 0, letterSpacing: -1 }}>
            Projects Dashboard
          </h1>
          <div style={{ marginTop: 8, ...subtle }}>
            React • TypeScript • TanStack Query • Forms + Validation • Charts
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name / owner / id…"
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #D0D5DD",
              minWidth: 260,
              outline: "none",
            }}
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #D0D5DD",
              outline: "none",
              background: "white",
            }}
          >
            {statusOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #D0D5DD",
              outline: "none",
              background: "white",
            }}
          >
            {sortOptions.map((o) => (
              <option key={o.value} value={o.value}>
                Sort: {o.label}
              </option>
            ))}
          </select>

          <button
            onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
            title="Toggle sort direction"
            style={{
              width: 44,
              height: 40,
              borderRadius: 12,
              border: "1px solid #D0D5DD",
              background: "white",
              cursor: "pointer",
              fontSize: 16,
            }}
          >
            {sortDir === "asc" ? "↑" : "↓"}
          </button>
        </div>
      </div>

      {errorMsg ? (
        <div
          style={{
            marginTop: 16,
            padding: "12px 14px",
            borderRadius: 12,
            border: "1px solid #FDA29B",
            background: "#FEF3F2",
            color: "#B42318",
          }}
        >
          <strong>Error:</strong> {errorMsg}
        </div>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(180px, 1fr))",
          gap: 14,
          marginTop: 18,
        }}
      >
        {kpis.map((k) => (
          <div key={k.label} style={{ ...card, padding: 16 }}>
            <div style={{ ...subtle, fontSize: 13 }}>{k.label}</div>
            <div style={{ fontSize: 30, fontWeight: 800, marginTop: 6 }}>{k.value}</div>
            {k.label === "Active Projects" ? (
              <div style={{ marginTop: 6, ...subtle, fontSize: 12 }}>Filter affects KPIs</div>
            ) : null}
            {k.label === "Burn Rate" ? (
              <div style={{ marginTop: 6, ...subtle, fontSize: 12 }}>spent / budget</div>
            ) : null}
          </div>
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.6fr 1fr",
          gap: 16,
          marginTop: 16,
          alignItems: "start",
        }}
      >
        <div style={{ ...card, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <h2 style={{ margin: 0, fontSize: 28 }}>Projects</h2>
            <div style={{ ...subtle, fontSize: 13 }}>
              Showing {filteredProjects.length} • Page {safePage}/{totalPages}
            </div>
          </div>

          <div style={{ marginTop: 12, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 680 }}>
              <thead>
                <tr style={{ textAlign: "left" }}>
                  {["Name", "Owner", "Status", "Budget", "Spent", "Created", ""].map((h) => (
                    <th
                      key={h}
                      style={{
                        fontSize: 12,
                        letterSpacing: 0.4,
                        textTransform: "none",
                        color: "#344054",
                        padding: "10px 8px",
                        borderBottom: "1px solid #EAECF0",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {projectsQuery.isLoading ? (
                  <tr>
                    <td colSpan={7} style={{ padding: 14, ...subtle }}>
                      Loading…
                    </td>
                  </tr>
                ) : pagedProjects.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: 14, ...subtle }}>
                      No projects found.
                    </td>
                  </tr>
                ) : (
                  pagedProjects.map((p) => (
                    <tr key={p.id}>
                      <td style={{ padding: "10px 8px", borderBottom: "1px solid #F2F4F7" }}>
                        <div style={{ fontWeight: 700 }}>{p.name}</div>
                      </td>
                      <td style={{ padding: "10px 8px", borderBottom: "1px solid #F2F4F7" }}>
                        {p.owner}
                      </td>
                      <td style={{ padding: "10px 8px", borderBottom: "1px solid #F2F4F7" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "4px 10px",
                            borderRadius: 999,
                            fontSize: 12,
                            fontWeight: 700,
                            border: "1px solid #EAECF0",
                            background:
                              p.status === "ACTIVE"
                                ? "#ECFDF3"
                                : p.status === "PAUSED"
                                ? "#FFF6ED"
                                : "#EEF4FF",
                            color:
                              p.status === "ACTIVE"
                                ? "#027A48"
                                : p.status === "PAUSED"
                                ? "#B54708"
                                : "#3538CD",
                          }}
                        >
                          {p.status}
                        </span>
                      </td>
                      <td style={{ padding: "10px 8px", borderBottom: "1px solid #F2F4F7" }}>
                        {formatEUR(p.budget ?? 0)}
                      </td>
                      <td style={{ padding: "10px 8px", borderBottom: "1px solid #F2F4F7" }}>
                        {formatEUR(p.spent ?? 0)}
                      </td>
                      <td style={{ padding: "10px 8px", borderBottom: "1px solid #F2F4F7" }}>
                        {p.createdAt}
                      </td>
                      <td style={{ padding: "10px 8px", borderBottom: "1px solid #F2F4F7" }}>
                        <button
                          onClick={() => deleteMutation.mutate(p.id)}
                          disabled={deleteMutation.isPending}
                          style={{
                            padding: "8px 12px",
                            borderRadius: 10,
                            border: "1px solid #D0D5DD",
                            background: "white",
                            cursor: "pointer",
                          }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div
            style={{
              marginTop: 12,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 10,
            }}
          >
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              style={{
                padding: "10px 14px",
                borderRadius: 12,
                border: "1px solid #D0D5DD",
                background: "white",
                cursor: "pointer",
                opacity: safePage <= 1 ? 0.5 : 1,
              }}
            >
              Prev
            </button>
            <div style={{ ...subtle, fontSize: 13 }}>
              Page {safePage} of {totalPages}
            </div>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              style={{
                padding: "10px 14px",
                borderRadius: 12,
                border: "1px solid #D0D5DD",
                background: "white",
                cursor: "pointer",
                opacity: safePage >= totalPages ? 0.5 : 1,
              }}
            >
              Next
            </button>
          </div>
        </div>

        <div style={{ ...card, padding: 16 }}>
          <h2 style={{ margin: 0, fontSize: 28 }}>Create project</h2>

          <form
            onSubmit={form.handleSubmit((values) => {
              const payload: Omit<Project, "id"> = {
                ...values,
                budget: Number(values.budget),
                spent: Number(values.spent),
              };
              createMutation.mutate(payload);
              form.reset({
                name: "",
                owner: values.owner,
                status: values.status,
                budget: 0,
                spent: 0,
                createdAt: values.createdAt,
              });
            })}
            style={{ marginTop: 12, display: "grid", gap: 10 }}
          >
            <div>
              <label style={{ fontSize: 12, color: "#344054" }}>Name</label>
              <input
                {...form.register("name")}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid #D0D5DD",
                  outline: "none",
                }}
              />
              {form.formState.errors.name ? (
                <div style={{ color: "#B42318", fontSize: 12, marginTop: 4 }}>
                  {form.formState.errors.name.message}
                </div>
              ) : null}
            </div>

            <div>
              <label style={{ fontSize: 12, color: "#344054" }}>Owner</label>
              <input
                {...form.register("owner")}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid #D0D5DD",
                  outline: "none",
                }}
              />
              {form.formState.errors.owner ? (
                <div style={{ color: "#B42318", fontSize: 12, marginTop: 4 }}>
                  {form.formState.errors.owner.message}
                </div>
              ) : null}
            </div>

            <div>
              <label style={{ fontSize: 12, color: "#344054" }}>Status</label>
              <select
                {...form.register("status")}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid #D0D5DD",
                  outline: "none",
                  background: "white",
                }}
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="PAUSED">PAUSED</option>
                <option value="DONE">DONE</option>
              </select>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={{ fontSize: 12, color: "#344054" }}>Budget</label>
                <input
                  type="number"
                  step="1"
                  {...form.register("budget")}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid #D0D5DD",
                    outline: "none",
                  }}
                />
                {form.formState.errors.budget ? (
                  <div style={{ color: "#B42318", fontSize: 12, marginTop: 4 }}>
                    {form.formState.errors.budget.message}
                  </div>
                ) : null}
              </div>

              <div>
                <label style={{ fontSize: 12, color: "#344054" }}>Spent</label>
                <input
                  type="number"
                  step="1"
                  {...form.register("spent")}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid #D0D5DD",
                    outline: "none",
                  }}
                />
                {form.formState.errors.spent ? (
                  <div style={{ color: "#B42318", fontSize: 12, marginTop: 4 }}>
                    {form.formState.errors.spent.message}
                  </div>
                ) : null}
              </div>
            </div>

            <div>
              <label style={{ fontSize: 12, color: "#344054" }}>Created (YYYY-MM-DD)</label>
              <input
                {...form.register("createdAt")}
                placeholder="2026-01-05"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid #D0D5DD",
                  outline: "none",
                }}
              />
              {form.formState.errors.createdAt ? (
                <div style={{ color: "#B42318", fontSize: 12, marginTop: 4 }}>
                  {form.formState.errors.createdAt.message}
                </div>
              ) : null}
            </div>

            <button
              type="submit"
              disabled={createMutation.isPending}
              style={{
                marginTop: 4,
                padding: "12px 14px",
                borderRadius: 12,
                border: "1px solid #0B1220",
                background: "#0B1220",
                color: "white",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              {createMutation.isPending ? "Creating…" : "Create"}
            </button>
          </form>
        </div>
      </div>

      <ChartsPanel projects={filteredProjects} />
    </div>
  );
}
