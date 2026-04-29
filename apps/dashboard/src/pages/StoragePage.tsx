import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { QK } from "@/lib/query-keys";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderOpen, HardDrive, Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";

export default function StoragePage() {
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const [bucketName, setBucketName] = useState("");

	const { data, isLoading } = useQuery({
		queryKey: QK.storageBuckets(),
		queryFn: () => api.get<{ buckets: { Name: string; CreationDate?: string }[] }>("/admin/storage/buckets"),
	});

	const createMutation = useMutation({
		mutationFn: (name: string) => api.post("/admin/storage/buckets", { name }),
		onSuccess: () => {
			toast.success("Bucket created");
			setOpen(false);
			setBucketName("");
			queryClient.invalidateQueries({ queryKey: QK.storageBuckets() });
		},
		onError: (err: any) => toast.error(err.message),
	});

	if (isLoading) return <PageSkeleton />;

	const buckets = data?.buckets ?? [];

	return (
		<div>
			<PageHeader
				title="Storage"
				description="Manage storage buckets"
				action={
					<Dialog open={open} onOpenChange={setOpen}>
						<DialogTrigger asChild>
							<Button>
								<Plus size={16} className="mr-2" />
								Create Bucket
							</Button>
						</DialogTrigger>
						<DialogContent
							style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
						>
							<DialogHeader>
								<DialogTitle style={{ color: "var(--color-text-primary)" }}>
									Create Bucket
								</DialogTitle>
								<DialogDescription style={{ color: "var(--color-text-secondary)" }}>
									Create a new storage bucket (pocket) for your projects.
								</DialogDescription>
							</DialogHeader>
							<div className="space-y-4 py-4">
								<div className="grid gap-2">
									<Label>Bucket Name</Label>
									<Input
										placeholder="e.g., my-project-assets"
										value={bucketName}
										onChange={(e) => setBucketName(e.target.value)}
										required
									/>
								</div>
							</div>
							<DialogFooter>
								<Button type="button" variant="outline" onClick={() => setOpen(false)}>
									Cancel
								</Button>
								<Button
									onClick={() => createMutation.mutate(bucketName)}
									disabled={!bucketName.trim() || createMutation.isPending}
								>
									{createMutation.isPending ? (
										<Loader2 className="animate-spin mr-2" size={16} />
									) : (
										"Create"
									)}
								</Button>
							</DialogFooter>
						</DialogContent>
					</Dialog>
				}
			/>

			<div className="px-8 pb-8">
				{buckets.length === 0 ? (
					<EmptyState
						icon={HardDrive}
						title="No buckets"
						description="Storage buckets will appear here. Create one to get started."
					/>
				) : (
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
						{buckets.map((bucket) => (
							<Link key={bucket.Name} to={`/storage/${bucket.Name}`}>
								<Card className="hover:border-[var(--color-brand)] transition-colors">
									<CardContent className="p-5">
										<div className="flex items-center gap-3">
											<div
												className="w-10 h-10 rounded-lg flex items-center justify-center"
												style={{ background: "var(--color-brand-muted)" }}
											>
												<FolderOpen size={18} style={{ color: "var(--color-brand)" }} />
											</div>
											<div>
												<h3
													className="font-medium"
													style={{ color: "var(--color-text-primary)" }}
												>
													{bucket.Name}
												</h3>
												<p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
													{bucket.CreationDate
														? new Date(bucket.CreationDate).toLocaleDateString()
														: "S3 Bucket"}
												</p>
											</div>
										</div>
									</CardContent>
								</Card>
							</Link>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
