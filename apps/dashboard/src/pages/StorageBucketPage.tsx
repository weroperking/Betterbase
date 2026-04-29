import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { Download, HardDrive, Search, Trash2, Upload } from "lucide-react";
import { useState } from "react";
import { useParams } from "react-router";

export default function StorageBucketPage() {
	const { bucketName } = useParams();
	const [search, setSearch] = useState("");

	const { data, isLoading } = useQuery({
		queryKey: ["storageObjects", bucketName],
		queryFn: () => api.get<{ objects: { Key: string; Size: number; LastModified?: string; ETag?: string }[] }>(`/admin/storage/buckets/${bucketName}/objects`),
	});

	if (isLoading) return <PageSkeleton />;

	const objects = data?.objects ?? [];

	const formatSize = (bytes?: number) => {
		if (bytes == null) return "-";
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	};

	return (
		<div>
			<PageHeader
				title={bucketName ?? "Bucket"}
				description="Manage storage objects"
				action={
					<Button>
						<Upload size={16} />
						Upload
					</Button>
				}
			/>

			<div className="px-8 pb-8 space-y-6">
				{/* Search */}
				<div className="relative max-w-xs">
					<Search
						className="absolute left-3 top-1/2 -translate-y-1/2"
						size={14}
						style={{ color: "var(--color-text-muted)" }}
					/>
					<Input
						placeholder="Search objects..."
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						className="pl-9"
					/>
				</div>

				{/* Objects */}
				{objects.length === 0 ? (
					<EmptyState
						icon={HardDrive}
						title="No objects"
						description="Upload files to this bucket."
					/>
				) : (
					<div className="rounded-xl border" style={{ borderColor: "var(--color-border)" }}>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Name</TableHead>
									<TableHead>Size</TableHead>
									<TableHead>Last Modified</TableHead>
									<TableHead className="w-24">Actions</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{objects
									.filter((o) => o.Key.includes(search))
									.map((obj) => (
										<TableRow key={obj.Key}>
											<TableCell className="font-mono">{obj.Key}</TableCell>
											<TableCell style={{ color: "var(--color-text-secondary)" }}>
												{formatSize(obj.Size)}
											</TableCell>
											<TableCell style={{ color: "var(--color-text-secondary)" }}>
												{obj.LastModified
													? new Date(obj.LastModified).toLocaleDateString()
													: "-"}
											</TableCell>
											<TableCell>
												<div className="flex gap-1">
													<Button variant="ghost" size="icon">
														<Download size={14} />
													</Button>
													<Button variant="ghost" size="icon">
														<Trash2 size={14} style={{ color: "var(--color-danger)" }} />
													</Button>
												</div>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					)}
			</div>
		</div>
	);
}
