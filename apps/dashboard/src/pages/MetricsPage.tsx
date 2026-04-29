import { PageHeader } from "@/components/ui/PageHeader";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { StatCard } from "@/components/ui/StatCard";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { QK } from "@/lib/query-keys";
import { useQuery } from "@tanstack/react-query";
import {
	AlertTriangle,
	BarChart2,
	Clock,
	FolderOpen,
	TrendingUp,
	Users,
	Zap,
} from "lucide-react";
import { useSearchParams } from "react-router";
import {
	Area,
	AreaChart,
	Bar,
	BarChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
	Cell,
} from "recharts";

type Period = "24h" | "7d" | "30d";

export default function MetricsPage() {
	const [searchParams, setSearchParams] = useSearchParams();
	const periodParam = searchParams.get("period");
	const period: Period = ["24h", "7d", "30d"].includes(periodParam as Period)
		? (periodParam as Period)
		: "24h";

	const { data: metrics, isLoading: metricsLoading } = useQuery({
		queryKey: QK.metricsOverview(),
		queryFn: () => api.get<{ metrics: any }>("/admin/metrics/overview"),
		refetchInterval: 30_000,
	});

	const {
		data: latency,
		isLoading: latencyLoading,
		isError: latencyError,
	} = useQuery({
		queryKey: QK.metricsLatency(period),
		queryFn: () => api.get<{ latency: any }>(`/admin/metrics/latency?period=${period}`),
		refetchInterval: 30_000,
	});

	const {
		data: timeseries,
		isLoading: timeseriesLoading,
		isError: timeseriesError,
	} = useQuery({
		queryKey: QK.metricsTimeseries("requests", period),
		queryFn: () => api.get<{ timeseries: any[] }>(`/admin/metrics/timeseries?period=${period}`),
		refetchInterval: 30_000,
	});

	const {
		data: topEndpoints,
		isLoading: topEndpointsLoading,
		isError: topEndpointsError,
	} = useQuery({
		queryKey: QK.metricsTopEndpoints(period),
		queryFn: () =>
			api.get<{ endpoints: any[] }>(`/admin/metrics/top-endpoints?period=${period}&limit=15`),
		refetchInterval: 30_000,
	});

	if (metricsLoading) return <PageSkeleton />;

	const m = metrics?.metrics;
	const l = latency?.latency;
	const ts = timeseries?.timeseries ?? [];
	const endpoints = topEndpoints?.endpoints ?? [];

	const totalRequests = ts.reduce((sum: number, point: any) => sum + (point.total ?? 0), 0);
	const totalErrors = ts.reduce((sum: number, point: any) => sum + (point.errors ?? 0), 0);
	const errorRate = totalRequests > 0 ? ((totalErrors / totalRequests) * 100).toFixed(2) : "0.00";

	const setPeriod = (p: Period) => {
		const newParams = new URLSearchParams(searchParams);
		newParams.set("period", p);
		setSearchParams(newParams);
	};

	const latencyBars = l
		? [
				{ label: "P50", value: l.p50, color: "var(--color-success)" },
				{ label: "P95", value: l.p95, color: "var(--color-warning)" },
				{ label: "P99", value: l.p99, color: "var(--color-danger)" },
				{ label: "Avg", value: l.avg, color: "var(--color-brand)" },
			]
		: [];

	return (
		<div>
			<PageHeader
				title="Metrics"
				description="Detailed performance metrics and analytics for your Betterbase instance"
			/>

			<div className="px-8 pb-8 space-y-6">
				{/* Period selector */}
				<div className="flex gap-2">
					{(["24h", "7d", "30d"] as Period[]).map((p) => (
						<button
							key={p}
							onClick={() => setPeriod(p)}
							className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
								period === p ? "font-medium" : "opacity-60 hover:opacity-100"
							}`}
							style={{
								background: period === p ? "var(--color-brand)" : "var(--color-surface)",
								color: period === p ? "var(--color-text-inverse)" : "var(--color-text-secondary)",
								border: `1px solid ${period === p ? "var(--color-brand)" : "var(--color-border)"}`,
							}}
						>
							{p}
						</button>
					))}
				</div>

				{/* Key Metrics Cards */}
				<div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
					<StatCard
						label="Total Projects"
						value={m?.projects ?? 0}
						icon={FolderOpen}
						color="brand"
					/>
					<StatCard
						label="Active Functions"
						value={m?.active_functions ?? 0}
						icon={Zap}
						color="success"
					/>
					<StatCard
						label="Total Users"
						value={m?.total_end_users ?? 0}
						icon={Users}
						color="default"
					/>
					<StatCard
						label="Avg Response Time"
						value={`${l?.avg ?? 0}ms`}
						icon={Clock}
						color="default"
					/>
				</div>

				{/* Secondary stats */}
				<div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
					<div
						className="rounded-xl p-4 text-center"
						style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
					>
						<div className="flex items-center justify-center gap-1.5 mb-1">
							<TrendingUp size={14} style={{ color: "var(--color-text-muted)" }} />
							<span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
								Requests ({period})
							</span>
						</div>
						<div className="text-2xl font-semibold" style={{ color: "var(--color-text-primary)" }}>
							{totalRequests.toLocaleString()}
						</div>
					</div>
					<div
						className="rounded-xl p-4 text-center"
						style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
					>
						<div className="flex items-center justify-center gap-1.5 mb-1">
							<AlertTriangle size={14} style={{ color: "var(--color-text-muted)" }} />
							<span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
								Errors ({period})
							</span>
						</div>
						<div
							className="text-2xl font-semibold"
							style={{
								color: totalErrors > 0 ? "var(--color-danger)" : "var(--color-text-primary)",
							}}
						>
							{totalErrors.toLocaleString()}
						</div>
					</div>
					<div
						className="rounded-xl p-4 text-center"
						style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
					>
						<div className="flex items-center justify-center gap-1.5 mb-1">
							<BarChart2 size={14} style={{ color: "var(--color-text-muted)" }} />
							<span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
								Error Rate
							</span>
						</div>
						<div
							className="text-2xl font-semibold"
							style={{
								color: Number(errorRate) > 1 ? "var(--color-danger)" : "var(--color-text-primary)",
							}}
						>
							{errorRate}%
						</div>
					</div>
					<div
						className="rounded-xl p-4 text-center"
						style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
					>
						<div className="flex items-center justify-center gap-1.5 mb-1">
							<Clock size={14} style={{ color: "var(--color-text-muted)" }} />
							<span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
								P95 Latency
							</span>
						</div>
						<div className="text-2xl font-semibold" style={{ color: "var(--color-text-primary)" }}>
							{l?.p95 ?? 0}ms
						</div>
					</div>
				</div>

				{/* Charts row */}
				<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
					{/* Request Trends */}
					{timeseriesLoading ? (
						<Skeleton className="h-64 rounded-xl" />
					) : timeseriesError ? (
						<div
							className="rounded-xl p-5"
							style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
						>
							<div style={{ color: "var(--color-danger)" }}>Failed to load request trends</div>
						</div>
					) : (
						<div
							className="rounded-xl p-5"
							style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
						>
							<h2
								className="text-sm font-medium mb-4"
								style={{ color: "var(--color-text-primary)" }}
							>
								Request Trends — {period}
							</h2>
							<div className="h-64">
								<ResponsiveContainer width="100%" height="100%">
									<AreaChart data={ts} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
										<XAxis
											dataKey="bucket"
											tickFormatter={(v) =>
												new Date(v).toLocaleTimeString([], { hour: "2-digit" })
											}
											stroke="var(--color-text-muted)"
											fontSize={11}
										/>
										<YAxis stroke="var(--color-text-muted)" fontSize={11} />
										<Tooltip
											contentStyle={{
												background: "var(--color-surface)",
												border: "1px solid var(--color-border)",
												borderRadius: "6px",
											}}
										/>
										<Area
											type="monotone"
											dataKey="total"
											stroke="var(--color-brand)"
											fill="var(--color-brand-muted)"
											strokeWidth={2}
											name="Total Requests"
										/>
										<Area
											type="monotone"
											dataKey="errors"
											stroke="var(--color-danger)"
											fill="var(--color-danger-muted)"
											strokeWidth={2}
											name="Errors"
										/>
									</AreaChart>
								</ResponsiveContainer>
							</div>
						</div>
					)}

					{/* Latency Distribution */}
					{latencyLoading ? (
						<Skeleton className="h-64 rounded-xl" />
					) : latencyError ? (
						<div
							className="rounded-xl p-5"
							style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
						>
							<div style={{ color: "var(--color-danger)" }}>Failed to load latency data</div>
						</div>
					) : (
						<div
							className="rounded-xl p-5"
							style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
						>
							<h2
								className="text-sm font-medium mb-4"
								style={{ color: "var(--color-text-primary)" }}
							>
								Latency Distribution — {period}
							</h2>
							<div className="h-64">
								<ResponsiveContainer width="100%" height="100%">
									<BarChart data={latencyBars} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
										<XAxis
											dataKey="label"
											stroke="var(--color-text-muted)"
											fontSize={12}
										/>
										<YAxis
											stroke="var(--color-text-muted)"
											fontSize={11}
											label={{
												value: "ms",
												angle: -90,
												position: "insideLeft",
												style: { fill: "var(--color-text-muted)", fontSize: 11 },
											}}
										/>
										<Tooltip
											contentStyle={{
												background: "var(--color-surface)",
												border: "1px solid var(--color-border)",
												borderRadius: "6px",
											}}
											formatter={(value: number) => [`${value}ms`, "Latency"]}
										/>
										<Bar dataKey="value" radius={[6, 6, 0, 0]}>
											{latencyBars.map((entry, index) => (
												<Cell key={`cell-${index}`} fill={entry.color} />
											))}
										</Bar>
									</BarChart>
								</ResponsiveContainer>
							</div>
						</div>
					)}
				</div>

				{/* Top Endpoints Performance */}
				{topEndpointsLoading ? (
					<Skeleton className="h-64 rounded-xl" />
				) : topEndpointsError ? (
					<div
						className="rounded-xl overflow-hidden"
						style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
					>
						<div className="px-5 py-4" style={{ color: "var(--color-danger)" }}>
							Failed to load top endpoints
						</div>
					</div>
				) : (
					<div
						className="rounded-xl overflow-hidden"
						style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
					>
						<h2
							className="text-sm font-medium px-5 py-4"
							style={{ color: "var(--color-text-primary)" }}
						>
							Top Endpoints by Requests — {period}
						</h2>
						<div className="overflow-x-auto">
							<table className="w-full text-sm">
								<thead>
									<tr
										className="text-left text-xs border-b"
										style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
									>
										<th className="px-5 py-3 font-medium">Rank</th>
										<th className="px-5 py-3 font-medium">Method</th>
										<th className="px-5 py-3 font-medium">Endpoint</th>
										<th className="px-5 py-3 font-medium text-right">Requests</th>
										<th className="px-5 py-3 font-medium text-right">Avg Latency</th>
										<th className="px-5 py-3 font-medium text-right">Errors</th>
									</tr>
								</thead>
								<tbody>
									{endpoints.length === 0 ? (
										<tr>
											<td
												colSpan={6}
												className="px-5 py-8 text-center"
												style={{ color: "var(--color-text-muted)" }}
											>
												No endpoint data available
											</td>
										</tr>
									) : (
										endpoints.map((ep: any, i: number) => (
											<tr
												key={i}
												className="border-t"
												style={{ borderColor: "var(--color-border)" }}
											>
												<td
													className="px-5 py-3"
													style={{ color: "var(--color-text-muted)" }}
												>
													#{i + 1}
												</td>
												<td className="px-5 py-3">
													<span
														className="px-2 py-0.5 rounded text-xs font-medium"
														style={{
															background: "var(--color-brand-muted)",
															color: "var(--color-brand)",
														}}
													>
														{ep.method}
													</span>
												</td>
												<td
													className="px-5 py-3 font-mono text-xs"
													style={{ color: "var(--color-text-secondary)" }}
												>
													{ep.path}
												</td>
												<td
													className="px-5 py-3 text-right font-medium"
													style={{ color: "var(--color-text-primary)" }}
												>
													{ep.requests?.toLocaleString() ?? ep.count?.toLocaleString() ?? 0}
												</td>
												<td
													className="px-5 py-3 text-right"
													style={{ color: "var(--color-text-primary)" }}
												>
													{ep.avg_ms}ms
												</td>
												<td
													className="px-5 py-3 text-right"
													style={{
														color:
															ep.errors > 0 ? "var(--color-danger)" : "var(--color-text-muted)",
													}}
												>
													{ep.errors}
												</td>
											</tr>
										))
									)}
								</tbody>
							</table>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
