import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api";
import {
	type InngestFunction,
	type InngestRun,
	type InngestStatus,
	inngestApi,
} from "@/lib/inngest-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	Activity,
	AlertCircle,
	CheckCircle,
	Clock,
	Loader2,
	PlayCircle,
	Save,
	Settings,
	XCircle,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

function getStatusIcon(status: string) {
	switch (status) {
		case "complete":
		case "active":
			return <CheckCircle className="w-4 h-4 text-green-500" />;
		case "failed":
			return <XCircle className="w-4 h-4 text-red-500" />;
		case "running":
			return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
		case "pending":
			return <Clock className="w-4 h-4 text-yellow-500" />;
		default:
			return <AlertCircle className="w-4 h-4 text-gray-500" />;
	}
}

function getStatusBadge(status: string) {
	const variants: Record<string, "success" | "destructive" | "warning" | "secondary" | "default"> =
		{
			complete: "success",
			active: "success",
			failed: "destructive",
			running: "secondary",
			pending: "warning",
			paused: "default",
		};
	return <Badge variant={variants[status] ?? "default"}>{status}</Badge>;
}

export default function InngestDashboardPage() {
	const queryClient = useQueryClient();
	const [selectedFunction, setSelectedFunction] = useState<string | null>(null);
	const [runStatusFilter, setRunStatusFilter] = useState<string>("");
	const [showConfig, setShowConfig] = useState(false);
	const [configForm, setConfigForm] = useState({
		inngest_api_key: "",
		inngest_env_id: "",
		inngest_base_url: "",
	});

	// Connection status
	const {
		data: status,
		isLoading: statusLoading,
		refetch: refetchStatus,
	} = useQuery({
		queryKey: ["inngest-status"],
		queryFn: inngestApi.getStatus,
		refetchInterval: 30000,
	});

	// Functions list
	const { data: functionsData, isLoading: functionsLoading } = useQuery({
		queryKey: ["inngest-functions"],
		queryFn: inngestApi.getFunctions,
		refetchInterval: 60000,
	});

	// Runs for selected function
	const { data: runsData, isLoading: runsLoading } = useQuery({
		queryKey: ["inngest-runs", selectedFunction, runStatusFilter],
		queryFn: () => inngestApi.getFunctionRuns(selectedFunction!, runStatusFilter),
		enabled: !!selectedFunction,
		refetchInterval: 10000,
	});

	// Test mutation
	const testMutation = useMutation({
		mutationFn: inngestApi.triggerTest,
		onSuccess: (data) => {
			toast.success(data.message ?? "Test event sent");
		},
		onError: (err: any) => toast.error(err.message ?? "Failed to trigger test"),
	});

	// Cancel mutation
	const cancelMutation = useMutation({
		mutationFn: inngestApi.cancelRun,
		onSuccess: (data) => {
			toast.success(data.message ?? "Run cancelled");
			queryClient.invalidateQueries({ queryKey: ["inngest-runs"] });
		},
		onError: (err: any) => toast.error(err.message ?? "Failed to cancel run"),
	});

	// Save config mutation
	const saveConfigMutation = useMutation({
		mutationFn: (data: {
			inngest_api_key?: string;
			inngest_env_id?: string;
			inngest_base_url?: string;
		}) => api.patch("/admin/instance", data),
		onSuccess: () => {
			toast.success("Inngest configuration saved");
			setShowConfig(false);
			refetchStatus();
		},
		onError: (err: any) => toast.error(err.message ?? "Failed to save configuration"),
	});

	const isConnected = status?.status === "connected";

	return (
		<div>
			<PageHeader title="Inngest Dashboard" description="Monitor and manage background workflows" />

			<div className="px-8 pb-8 space-y-6">
				{/* Connection Status */}
				<Card style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
					<CardHeader className="pb-2">
						<CardTitle
							className="text-sm font-medium"
							style={{ color: "var(--color-text-primary)" }}
						>
							Connection Status
						</CardTitle>
					</CardHeader>
					<CardContent>
						{statusLoading ? (
							<Loader2 className="w-5 h-5 animate-spin" />
						) : isConnected ? (
							<div className="flex items-center gap-4">
								<CheckCircle className="w-5 h-5 text-green-500" />
								<span className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
									Connected to Inngest ({status.mode}) — {status.url}
								</span>
							</div>
						) : (
							<div className="space-y-4">
								<div className="flex items-center gap-4">
									<XCircle className="w-5 h-5 text-red-500" />
									<span className="text-sm text-red-500" style={{ color: "var(--color-danger)" }}>
										{status?.error ?? "Unable to connect to Inngest"}
									</span>
									<Button variant="outline" size="sm" onClick={() => refetchStatus()}>
										Retry
									</Button>
								</div>
								{!showConfig && (
									<Button variant="ghost" size="sm" onClick={() => setShowConfig(true)}>
										<Settings size={14} className="mr-1.5" />
										Configure Connection
									</Button>
								)}
								{showConfig && (
									<div
										className="rounded-lg p-4 space-y-3"
										style={{
											background: "var(--color-surface-elevated)",
											border: "1px solid var(--color-border)",
										}}
									>
										<div className="grid gap-2">
											<Label>API Key</Label>
											<Input
												placeholder="Inngest API key"
												value={configForm.inngest_api_key}
												onChange={(e) =>
													setConfigForm((f) => ({ ...f, inngest_api_key: e.target.value }))
												}
											/>
										</div>
										<div className="grid gap-2">
											<Label>Environment ID (optional)</Label>
											<Input
												placeholder="e.g., production"
												value={configForm.inngest_env_id}
												onChange={(e) =>
													setConfigForm((f) => ({ ...f, inngest_env_id: e.target.value }))
												}
											/>
										</div>
										<div className="grid gap-2">
											<Label>Base URL (optional)</Label>
											<Input
												placeholder="https://api.inngest.com or http://localhost:8288"
												value={configForm.inngest_base_url}
												onChange={(e) =>
													setConfigForm((f) => ({ ...f, inngest_base_url: e.target.value }))
												}
											/>
											<p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
												Leave empty for Inngest Cloud. Use http://localhost:8288 for local dev
												server.
											</p>
										</div>
										<div className="flex gap-2 pt-1">
											<Button
												variant="outline"
												size="sm"
												onClick={() => setShowConfig(false)}
											>
												Cancel
											</Button>
											<Button
												size="sm"
												onClick={() =>
													saveConfigMutation.mutate({
														inngest_api_key: configForm.inngest_api_key || undefined,
														inngest_env_id: configForm.inngest_env_id || undefined,
														inngest_base_url: configForm.inngest_base_url || undefined,
													})
												}
												disabled={saveConfigMutation.isPending}
											>
												{saveConfigMutation.isPending ? (
													<Loader2 className="animate-spin mr-1.5" size={14} />
												) : (
													<Save size={14} className="mr-1.5" />
												)}
												Save
											</Button>
										</div>
									</div>
								)}
							</div>
						)}
					</CardContent>
				</Card>

				{/* Functions or Runs View */}
				{selectedFunction ? (
					<Card style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
						<CardHeader className="flex flex-row items-center justify-between">
							<div>
								<CardTitle style={{ color: "var(--color-text-primary)" }}>Function Runs</CardTitle>
								<CardDescription style={{ color: "var(--color-text-secondary)" }}>
									Recent executions of {selectedFunction}
								</CardDescription>
							</div>
							<div className="flex gap-2">
								<label
									htmlFor="run-status-filter"
									className="text-sm"
									style={{ color: "var(--color-text-secondary)" }}
								>
									Run status:
								</label>
								<select
									id="run-status-filter"
									className="border rounded px-2 py-1 text-sm"
									style={{ background: "var(--color-surface)", color: "var(--color-text-primary)" }}
									value={runStatusFilter}
									onChange={(e) => setRunStatusFilter(e.target.value)}
									aria-label="Filter runs by status"
								>
									<option value="">All Status</option>
									<option value="pending">Pending</option>
									<option value="running">Running</option>
									<option value="complete">Complete</option>
									<option value="failed">Failed</option>
								</select>
								<Button variant="outline" size="sm" onClick={() => setSelectedFunction(null)}>
									Back to Functions
								</Button>
							</div>
						</CardHeader>
						<CardContent>
							{runsLoading ? (
								<div className="flex items-center justify-center py-8">
									<Loader2 className="w-6 h-6 animate-spin" />
								</div>
							) : (
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Run ID</TableHead>
											<TableHead>Status</TableHead>
											<TableHead>Started</TableHead>
											<TableHead>Ended</TableHead>
											<TableHead>Actions</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{runsData?.runs?.map((run) => (
											<TableRow key={run.id}>
												<TableCell
													className="font-mono text-xs"
													style={{ color: "var(--color-text-primary)" }}
												>
													{run.id.slice(0, 8)}...
												</TableCell>
												<TableCell>
													<div className="flex items-center gap-2">
														{getStatusIcon(run.status)}
														{getStatusBadge(run.status)}
													</div>
												</TableCell>
												<TableCell
													className="text-sm"
													style={{ color: "var(--color-text-secondary)" }}
												>
													{new Date(run.startedAt).toLocaleString()}
												</TableCell>
												<TableCell
													className="text-sm"
													style={{ color: "var(--color-text-secondary)" }}
												>
													{run.endedAt ? new Date(run.endedAt).toLocaleString() : "—"}
												</TableCell>
												<TableCell>
													{run.status === "running" && (
														<Button
															variant="ghost"
															size="sm"
															onClick={() => cancelMutation.mutate(run.id)}
															disabled={cancelMutation.isPending}
														>
															Cancel
														</Button>
													)}
												</TableCell>
											</TableRow>
										))}
										{(!runsData?.runs || runsData.runs.length === 0) && (
											<TableRow>
												<TableCell
													colSpan={5}
													className="text-center py-8"
													style={{ color: "var(--color-text-muted)" }}
												>
													No runs found for this function.
												</TableCell>
											</TableRow>
										)}
									</TableBody>
								</Table>
							)}
						</CardContent>
					</Card>
				) : (
					<Card style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
						<CardHeader>
							<CardTitle style={{ color: "var(--color-text-primary)" }}>
								<Activity size={18} className="inline mr-2" />
								Registered Functions
							</CardTitle>
							<CardDescription style={{ color: "var(--color-text-secondary)" }}>
								BetterBase background workflow functions
							</CardDescription>
						</CardHeader>
						<CardContent>
							{functionsLoading ? (
								<div className="flex items-center justify-center py-8">
									<Loader2 className="w-6 h-6 animate-spin" />
								</div>
							) : (
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Function</TableHead>
											<TableHead>Triggers</TableHead>
											<TableHead>Status</TableHead>
											<TableHead>Actions</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{functionsData?.functions?.map((fn: InngestFunction) => (
											<TableRow key={fn.id}>
												<TableCell
													className="font-medium"
													style={{ color: "var(--color-text-primary)" }}
												>
													{fn.name}
												</TableCell>
												<TableCell>
													{fn.triggers?.map((t) => (
														<Badge key={t.type} variant="outline" className="mr-1">
															{t.event ?? t.cron ?? t.type}
														</Badge>
													))}
												</TableCell>
												<TableCell>{getStatusBadge(fn.status)}</TableCell>
												<TableCell>
													<div className="flex gap-2">
														<Button
															variant="outline"
															size="sm"
															onClick={() => setSelectedFunction(fn.id)}
														>
															View Runs
														</Button>
														<Button
															variant="ghost"
															size="sm"
															onClick={() => testMutation.mutate(fn.id)}
															disabled={testMutation.isPending}
														>
															<PlayCircle className="w-4 h-4 mr-1" />
															Test
														</Button>
													</div>
												</TableCell>
											</TableRow>
										))}
										{(!functionsData?.functions || functionsData.functions.length === 0) && (
											<TableRow>
												<TableCell
													colSpan={4}
													className="text-center py-8"
													style={{ color: "var(--color-text-muted)" }}
												>
													No functions registered. Functions are created automatically when defined
													in the server.
												</TableCell>
											</TableRow>
										)}
									</TableBody>
								</Table>
							)}
						</CardContent>
					</Card>
				)}
			</div>
		</div>
	);
}
