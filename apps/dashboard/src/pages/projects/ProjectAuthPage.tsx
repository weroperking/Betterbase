import { PageHeader } from "@/components/ui/PageHeader";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";
import { QK } from "@/lib/query-keys";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useParams } from "react-router";
import { toast } from "sonner";

export default function ProjectAuthPage() {
	const { projectId } = useParams();
	const queryClient = useQueryClient();
	const [config, setConfig] = useState<any>({});

	const { data, isLoading } = useQuery({
		queryKey: QK.projectAuthConfig(projectId!),
		queryFn: () => api.get<any>(`/admin/projects/${projectId}/auth-config`),
	});

	const updateMutation = useMutation({
		mutationFn: (updates: any) => api.patch(`/admin/projects/${projectId}/auth-config`, updates),
		onSuccess: () => {
			toast.success("Auth configuration updated");
			queryClient.invalidateQueries({ queryKey: QK.projectAuthConfig(projectId!) });
		},
		onError: (err: any) => toast.error(err.message),
	});

	if (isLoading) return <PageSkeleton />;

	const authConfig = data?.config ?? {};

	return (
		<div>
			<PageHeader title="Authentication" description="Configure auth providers for this project" />

			<div className="px-8 pb-8 space-y-6">
				{/* OAuth Providers */}
				<Card>
					<CardHeader>
						<CardTitle>OAuth Providers</CardTitle>
						<CardDescription>Enable sign-in with external providers</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						{["google", "github", "discord", "twitter"].map((provider) => (
							<div key={provider} className="flex items-center justify-between">
								<div className="flex items-center gap-2">
									<span style={{ color: "var(--color-text-primary)" }} className="capitalize">
										{provider}
									</span>
									<Badge variant={authConfig[`${provider}_enabled`] ? "success" : "secondary"}>
										{authConfig[`${provider}_enabled`] ? "Enabled" : "Disabled"}
									</Badge>
								</div>
								<Switch
									checked={authConfig[`${provider}_enabled`] ?? false}
									onCheckedChange={(checked) => {
										const updates = { ...config, [`${provider}_enabled`]: checked };
										setConfig(updates);
										updateMutation.mutate(updates);
									}}
								/>
							</div>
						))}
					</CardContent>
				</Card>

				{/* Email Config */}
				<Card>
					<CardHeader>
						<CardTitle>Email</CardTitle>
						<CardDescription>Configure email-based authentication</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="flex items-center justify-between">
							<Label>Allow Password Sign-in</Label>
							<Switch
								checked={authConfig.password_enabled ?? true}
								onCheckedChange={(checked) => {
									const updates = { ...config, password_enabled: checked };
									setConfig(updates);
									updateMutation.mutate(updates);
								}}
							/>
						</div>
						<div className="flex items-center justify-between">
							<Label>Allow Magic Link</Label>
							<Switch
								checked={authConfig.magic_link_enabled ?? false}
								onCheckedChange={(checked) => {
									const updates = { ...config, magic_link_enabled: checked };
									setConfig(updates);
									updateMutation.mutate(updates);
								}}
							/>
						</div>
					</CardContent>
				</Card>

				{/* Session Config */}
				<Card>
					<CardHeader>
						<CardTitle>Session</CardTitle>
						<CardDescription>Configure session settings</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="space-y-2">
							<Label>Session Duration (days)</Label>
							<Input
								type="number"
								value={authConfig.session_days ?? 7}
								onChange={(e) =>
									setConfig({ ...config, session_days: Number.parseInt(e.target.value) })
								}
								onBlur={() => updateMutation.mutate(config)}
								className="w-32"
							/>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
