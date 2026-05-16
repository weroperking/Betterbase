import { api } from "@/lib/api";
import { QK } from "@/lib/query-keys";
import { useQuery } from "@tanstack/react-query";
import { Command } from "cmdk";
import {
	Activity,
	BarChart2,
	Bell,
	Clock,
	Code,
	Database,
	FolderOpen,
	Globe,
	HardDrive,
	Key,
	LayoutDashboard,
	ScrollText,
	Settings,
	Shield,
	Users,
	Webhook,
	Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";

interface CommandPaletteProps {
	open: boolean;
	onClose: () => void;
}

interface CommandItem {
	label: string;
	href: string;
	icon: React.ElementType;
	keywords?: string;
}

const staticCommands: CommandItem[] = [
	{ label: "Overview", href: "/", icon: LayoutDashboard },
	{ label: "Projects", href: "/projects", icon: FolderOpen },
	{ label: "Storage", href: "/storage", icon: HardDrive },
	{ label: "Logs", href: "/logs", icon: ScrollText },
	{ label: "Observability", href: "/observability", icon: Activity },
	{ label: "Metrics", href: "/metrics", icon: BarChart2 },
	{ label: "Audit Log", href: "/audit", icon: Shield },
	{ label: "Team", href: "/team", icon: Users },
	{ label: "Settings", href: "/settings", icon: Settings, keywords: "general" },
	{ label: "SMTP Settings", href: "/settings/smtp", icon: Settings },
	{ label: "Notifications", href: "/settings/notifications", icon: Bell },
	{ label: "API Keys", href: "/settings/api-keys", icon: Key },
	{ label: "Inngest", href: "/settings/inngest", icon: Zap },
];

const projectTabCommands = (projectId: string): CommandItem[] => [
	{ label: "Overview", href: `/projects/${projectId}`, icon: FolderOpen },
	{ label: "Observability", href: `/projects/${projectId}/observability`, icon: Activity },
	{ label: "Users", href: `/projects/${projectId}/users`, icon: Users },
	{ label: "Auth", href: `/projects/${projectId}/auth`, icon: Key },
	{ label: "Database", href: `/projects/${projectId}/database`, icon: Database },
	{ label: "Environment", href: `/projects/${projectId}/env`, icon: Globe },
	{ label: "Webhooks", href: `/projects/${projectId}/webhooks`, icon: Webhook },
	{ label: "Functions", href: `/projects/${projectId}/functions`, icon: Zap },
	{ label: "IaC Schema", href: `/projects/${projectId}/iac/schema`, icon: Code },
	{ label: "IaC Functions", href: `/projects/${projectId}/iac/functions`, icon: Code },
	{ label: "IaC Jobs", href: `/projects/${projectId}/iac/jobs`, icon: Code },
	{ label: "IaC Realtime", href: `/projects/${projectId}/iac/realtime`, icon: Code },
	{ label: "IaC Query", href: `/projects/${projectId}/iac/query`, icon: Code },
	{ label: "Realtime", href: `/projects/${projectId}/realtime`, icon: Clock },
];

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
	const navigate = useNavigate();
	const [query, setQuery] = useState("");

	const { data: projectsData } = useQuery({
		queryKey: QK.projects(),
		queryFn: () => api.get<{ projects: { id: string; name: string }[] }>("/admin/projects"),
		enabled: open,
	});

	useEffect(() => {
		if (!open) setQuery("");
	}, [open]);

	const allCommands = useMemo(() => {
		const commands = [...staticCommands];
		if (projectsData?.projects) {
			for (const project of projectsData.projects) {
				commands.push({
					label: project.name,
					href: `/projects/${project.id}`,
					icon: FolderOpen,
					keywords: `project ${project.name}`,
				});
				for (const tab of projectTabCommands(project.id)) {
					commands.push({
						label: `${project.name} > ${tab.label}`,
						href: tab.href,
						icon: tab.icon,
						keywords: `project ${project.name} ${tab.label}`,
					});
				}
			}
		}
		return commands;
	}, [projectsData]);

	if (!open) return null;

	function go(href: string) {
		navigate(href);
		onClose();
	}

	return (
		<div
			className="fixed inset-0 z-50 flex items-start justify-center pt-24"
			style={{ background: "rgba(0,0,0,0.7)" }}
			onClick={onClose}
		>
			<div
				className="w-[560px] rounded-2xl overflow-hidden shadow-2xl"
				style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
				onClick={(e) => e.stopPropagation()}
			>
				<Command>
					<div className="px-4 py-3 border-b" style={{ borderColor: "var(--color-border)" }}>
						<Command.Input
							value={query}
							onValueChange={setQuery}
							placeholder="Search pages, projects, settings..."
							className="w-full bg-transparent outline-none text-sm"
							style={{ color: "var(--color-text-primary)" }}
							autoFocus
						/>
					</div>
					<Command.List className="max-h-96 overflow-y-auto p-2">
						<Command.Empty
							className="py-8 text-center text-sm"
							style={{ color: "var(--color-text-muted)" }}
						>
							No results found.
						</Command.Empty>

						<Command.Group heading="Navigation">
							{staticCommands.map((cmd) => (
								<Command.Item
									key={cmd.href}
									value={cmd.label}
									onSelect={() => go(cmd.href)}
									className="flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer text-sm"
									style={{ color: "var(--color-text-secondary)" }}
								>
									<cmd.icon size={14} />
									{cmd.label}
								</Command.Item>
							))}
						</Command.Group>

						{(projectsData?.projects?.length ?? 0) > 0 && (
							<Command.Group heading="Projects">
								{allCommands
									.filter((c) => c.keywords?.includes("project"))
									.map((cmd) => (
										<Command.Item
											key={cmd.href}
											value={cmd.label}
											onSelect={() => go(cmd.href)}
											className="flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer text-sm"
											style={{ color: "var(--color-text-secondary)" }}
										>
											<cmd.icon size={14} />
											{cmd.label}
										</Command.Item>
									))}
							</Command.Group>
						)}
					</Command.List>
				</Command>
			</div>
		</div>
	);
}
