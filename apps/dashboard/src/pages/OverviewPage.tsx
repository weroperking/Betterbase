import { PageHeader } from "@/components/ui/PageHeader";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { StatCard } from "@/components/ui/StatCard";
import { api } from "@/lib/api";
import { QK } from "@/lib/query-keys";
import { formatRelative } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Clock, FolderOpen, Users, Webhook, Zap } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export default function OverviewPage() {
	const { data: metrics, isLoading } = useQuery({
		queryKey: QK.metricsOverview(),
		queryFn: () => api.get<{ metrics: any }>("/admin/metrics/overview"),
		refetchInterval: 30_000,
	});

	const { data: ts } = useQuery({
		queryKey: QK.metricsTimeseries("requests", "24h"),
		queryFn: () =>
			api.get<{ series: any[] }>("/admin/metrics/timeseries?metric=requests&period=24h"),
		refetchInterval: 60_000,
	});

	const { data: latency } = useQuery({
		queryKey: QK.metricsLatency("24h"),
		queryFn: () => api.get<{ latency: any }>("/admin/metrics/latency?period=24h"),
		refetchInterval: 60_000,
	});

	const { data: topEndpoints } = useQuery({
		queryKey: QK.metricsTopEndpoints("24h"),
		queryFn: () => api.get<{ endpoints: any[] }>("/admin/metrics/top-endpoints?period=24h"),
		refetchInterval: 60_000,
	});

	const { data: auditData } = useQuery({
		queryKey: QK.audit({ limit: "8" }),
		queryFn: () => api.get<{ logs: any[] }>("/admin/audit?limit=8"),
		refetchInterval: 30_000,
	});

	if (isLoading) return <PageSkeleton />;
	const m = metrics?.metrics;

	return (
		<div>
			<PageHeader title="Overview" description="Your Betterbase instance at a glance" />

			<div className="px-8 pb-8 space-y-6">
				{/* Stat cards */}
				<div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
					<StatCard label="Projects" value={m?.projects ?? 0} icon={FolderOpen} color="brand" />
					<StatCard
						label="Total Users"
						value={m?.total_end_users ?? 0}
						icon={Users}
						color="default"
					/>
					<StatCard
						label="Active Fns"
						value={m?.active_functions ?? 0}
						icon={Zap}
						color="success"
					/>
					<StatCard
						label="Errors (1h)"
						value={m?.recent_errors_1h ?? 0}
						icon={AlertTriangle}
						color={m?.recent_errors_1h > 0 ? "danger" : "default"}
					/>
				</div>

				{/* Latency pills */}
				{latency?.latency && (
					<div className="flex gap-3 flex-wrap">
						{[
							{ label: "P50", value: `${latency.latency.p50}ms` },
							{ label: "P95", value: `${latency.latency.p95}ms` },
							{ label: "P99", value: `${latency.latency.p99}ms` },
							{ label: "Avg", value: `${latency.latency.avg}ms` },
						].map(({ label, value }) => (
							<div
								key={label}
								className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs"
								style={{
									background: "var(--color-surface)",
									border: "1px solid var(--color-border)",
									color: "var(--color-text-secondary)",
								}}
							>
								<Clock size={11} />
								<span style={{ color: "var(--color-text-muted)" }}>{label}</span>
								<span style={{ color: "var(--color-text-primary)" }}>{value}</span>
							</div>
						))}
					</div>
				)}

				{/* Request volume chart */}
				<div
					className="rounded-xl p-5"
					style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
				>
					<h2 className="text-sm font-medium mb-4" style={{ color: "var(--color-text-primary)" }}>
						Request Volume — 24h
					</h2>
					<ResponsiveContainer width="100%" height={180}>
						<AreaChart data={ts?.series ?? []}>
							<defs>
								<linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
									<stop offset="5%" stopColor="var(--color-brand)" stopOpacity={0.3} />
									<stop offset="95%" stopColor="var(--color-brand)" stopOpacity={0} />
								</linearGradient>
							</defs>
							<XAxis
								dataKey="ts"
								tick={{ fontSize: 11, fill: "var(--color-text-muted)" }}
								tickFormatter={(v) => new Date(v).getHours() + "h"}
							/>
							<YAxis tick={{ fontSize: 11, fill: "var(--color-text-muted)" }} />
							<Tooltip
								contentStyle={{
									background: "var(--color-surface-elevated)",
									border: "1px solid var(--color-border)",
									borderRadius: 8,
								}}
							/>
							<Area
								type="monotone"
								dataKey="total"
								stroke="var(--color-brand)"
								fill="url(#grad)"
								strokeWidth={2}
								name="Requests"
							/>
							<Area
								type="monotone"
								dataKey="errors"
								stroke="var(--color-danger)"
								fill="none"
								strokeWidth={1.5}
								strokeDasharray="4 2"
								name="Errors"
							/>
						</AreaChart>
					</ResponsiveContainer>
				</div>

				{/* Bottom grid: top endpoints + recent audit */}
				<div className="grid grid-cols-2 gap-6">
					{/* Top endpoints */}
					<div
						className="rounded-xl p-5"
						style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
					>
						<h2 className="text-sm font-medium mb-4" style={{ color: "var(--color-text-primary)" }}>
							Top Endpoints
						</h2>
						<div className="space-y-2">
							{(topEndpoints?.endpoints ?? []).slice(0, 8).map((ep: any, i: number) => (
								<div key={i} className="flex items-center gap-3 text-xs">
									<code
										className="flex-1 truncate"
										style={{ color: "var(--color-text-secondary)", fontFamily: "var(--font-mono)" }}
									>
										{ep.path}
									</code>
									<span style={{ color: "var(--color-text-muted)" }}>{ep.avg_ms}ms</span>
									<span style={{ color: "var(--color-text-primary)" }}>
										{ep.requests.toLocaleString()}
									</span>
								</div>
							))}
						</div>
					</div>

					{/* Recent audit activity */}
					<div
						className="rounded-xl p-5"
						style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
					>
						<h2 className="text-sm font-medium mb-4" style={{ color: "var(--color-text-primary)" }}>
							Recent Activity
						</h2>
					<div className="space-y-3">
						{(auditData?.logs ?? []).length === 0 ? (
							<div className="text-center py-6 text-xs" style={{ color: "var(--color-text-muted)" }}>
								No recent activity yet.
							</div>
						) : (
							(auditData?.logs ?? []).map((log: any) => (
								<div key={log.id} className="flex items-start gap-2.5 text-xs">
									<div
										className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
										style={{ background: "var(--color-brand)" }}
									/>
									<div className="flex-1 min-w-0">
										<span style={{ color: "var(--color-text-secondary)" }}>
											{log.actor_email ?? "system"}
										</span>{" "}
										<span style={{ color: "var(--color-text-muted)" }}>{log.action}</span>
										{log.resource_name && (
											<>
												{" "}
												<span style={{ color: "var(--color-text-primary)" }}>
													{log.resource_name}
												</span>
											</>
										)}
									</div>
									<span className="shrink-0" style={{ color: "var(--color-text-muted)" }}>
										{formatRelative(log.created_at)}
									</span>
								</div>
							))
						)}
					</div>
					</div>
				</div>
			</div>
		</div>
	);
}
