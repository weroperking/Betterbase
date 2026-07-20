import { PageHeader } from "@/components/ui/PageHeader";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { QK } from "@/lib/query-keys";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Database, Play } from "lucide-react";
import { useState } from "react";
import { useParams } from "react-router";
import { toast } from "sonner";

export default function ProjectIaCQueryPage() {
	const { projectId } = useParams();
	const queryClient = useQueryClient();
	const [sql, setSql] = useState("SELECT * FROM users LIMIT 10");
	const [params, setParams] = useState("");

	const queryMutation = useMutation({
		mutationFn: async () => {
			const parsedParams = params ? JSON.parse(params) : undefined;
			return api.post<any>(`/admin/projects/${projectId}/iac/query`, {
				sql,
				params: parsedParams,
			});
		},
		onSuccess: (data) => {
			toast.success(`Retrieved ${data.row_count} rows`);
			queryClient.invalidateQueries({ queryKey: QK.project(projectId!) });
		},
		onError: (err: any) => {
			toast.error(err.message || "Query failed");
		},
	});

	const results = queryMutation.data;
	const columns = results?.columns ?? [];
	const rows = results?.rows ?? [];

	const exampleQueries = [
		{ label: "Get all users", sql: "SELECT * FROM users LIMIT 10" },
		{
			label: "Count tables",
			sql: "SELECT count(*) as table_count FROM information_schema.tables WHERE table_schema = current_schema()",
		},
		{ label: "Recent data", sql: "SELECT * FROM users ORDER BY created_at DESC LIMIT 5" },
	];

	return (
		<div>
			<PageHeader title="SQL Query Runner" description="Execute raw SQL queries (SELECT only)" />

			<div className="px-8 pb-8 space-y-6">
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Database size={18} /> Query
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="space-y-2">
							<Label>SQL Query</Label>
							<Input
								value={sql}
								onChange={(e) => setSql(e.target.value)}
								placeholder="SELECT * FROM table_name"
								className="font-mono"
							/>
						</div>
						<div className="space-y-2">
							<Label>Parameters (JSON array, optional)</Label>
							<Input
								value={params}
								onChange={(e) => setParams(e.target.value)}
								placeholder='["param1", "param2"]'
								className="font-mono"
							/>
						</div>
						<div className="flex gap-2">
							<Button
								onClick={() => queryMutation.mutate()}
								disabled={queryMutation.isPending || !sql.trim()}
							>
								<Play size={14} className="mr-2" />
								{queryMutation.isPending ? "Running..." : "Execute"}
							</Button>
						</div>

						<div className="flex flex-wrap gap-2">
							<span className="text-sm" style={{ color: "var(--color-text-muted)" }}>
								Examples:
							</span>
							{exampleQueries.map((ex) => (
								<Button key={ex.label} variant="outline" size="sm" onClick={() => setSql(ex.sql)}>
									{ex.label}
								</Button>
							))}
						</div>
					</CardContent>
				</Card>

				{queryMutation.error && (
					<Card style={{ borderColor: "var(--color-danger)" }}>
						<CardContent className="py-4 flex items-center gap-2">
							<AlertCircle size={16} style={{ color: "var(--color-danger)" }} />
							<span style={{ color: "var(--color-danger)" }}>
								{(queryMutation.error as any)?.message || "Query failed"}
							</span>
						</CardContent>
					</Card>
				)}

				{results && (
					<Card>
						<CardHeader>
							<CardTitle>Results ({rows.length} rows)</CardTitle>
						</CardHeader>
						<CardContent>
							{rows.length === 0 ? (
								<p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
									No results returned
								</p>
							) : (
								<div className="overflow-x-auto">
									<Table>
										<TableHeader>
											<TableRow>
												{columns.map((col: string) => (
													<TableHead key={col} className="font-mono">
														{col}
													</TableHead>
												))}
											</TableRow>
										</TableHeader>
										<TableBody>
											{rows.slice(0, 100).map((row: any, rowIdx: number) => (
												<TableRow key={row.id ?? rowIdx}>
													{columns.map((col: string) => (
														<TableCell key={col} className="font-mono text-sm">
															{row[col] === null ? (
																<span style={{ color: "var(--color-text-muted)" }}>NULL</span>
															) : typeof row[col] === "object" ? (
																JSON.stringify(row[col])
															) : (
																String(row[col])
															)}
														</TableCell>
													))}
												</TableRow>
											))}
										</TableBody>
									</Table>
								</div>
							)}
						</CardContent>
					</Card>
				)}
			</div>
		</div>
	);
}
