import { PageHeader } from "@/components/ui/PageHeader";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { QK } from "@/lib/query-keys";
import { useQuery } from "@tanstack/react-query";
import {
	Activity,
	Clock,
	Code,
	Database,
	FolderOpen,
	Globe,
	Key,
	Users,
	Webhook,
	Zap,
} from "lucide-react";
import { Link, Outlet, useLocation, useParams } from "react-router";

export default function ProjectLayout() {
	const { projectId } = useParams();
	const location = useLocation();

	const { data, isLoading } = useQuery({
		queryKey: QK.project(projectId!),
		queryFn: () => api.get<{ project: any }>(`/admin/projects/${projectId}`),
	});

	if (isLoading) return <PageSkeleton />;

	const project = data?.project;

	const tabs = [
		{ value: "overview", label: "Overview", icon: FolderOpen, href: `/projects/${projectId}` },
		{
			value: "observability",
			label: "Observability",
			icon: Activity,
			href: `/projects/${projectId}/observability`,
		},
		{ value: "users", label: "Users", icon: Users, href: `/projects/${projectId}/users` },
		{ value: "auth", label: "Auth", icon: Key, href: `/projects/${projectId}/auth` },
		{
			value: "database",
			label: "Database",
			icon: Database,
			href: `/projects/${projectId}/database`,
		},
		{ value: "env", label: "Environment", icon: Globe, href: `/projects/${projectId}/env` },
		{
			value: "webhooks",
			label: "Webhooks",
			icon: Webhook,
			href: `/projects/${projectId}/webhooks`,
		},
		{ value: "functions", label: "Functions", icon: Zap, href: `/projects/${projectId}/functions` },
		{ value: "iac", label: "IaC", icon: Code, href: `/projects/${projectId}/iac/schema` },
		{ value: "realtime", label: "Realtime", icon: Clock, href: `/projects/${projectId}/realtime` },
	];

	const currentPath = location.pathname;
	const activeTab =
		[...tabs].sort((a, b) => b.href.length - a.href.length).find((tab) => currentPath.startsWith(tab.href))
			?.value ?? "overview";

	return (
		<div>
			<PageHeader title={project?.name ?? "Project"} description={`Slug: ${project?.slug}`} />

			<div className="px-8">
				<Tabs value={activeTab}>
					<TabsList className="mb-6">
						{tabs.map((tab) => (
							<TabsTrigger key={tab.value} value={tab.value} asChild>
								<Link to={tab.href} className="flex items-center gap-1.5">
									<tab.icon size={14} /> {tab.label}
								</Link>
							</TabsTrigger>
						))}
					</TabsList>
				</Tabs>
			</div>

			<Outlet />
		</div>
	);
}
