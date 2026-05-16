import { Avatar } from "@/components/ui/Avatar";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
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
import { formatDate } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Key, Loader2, Plus, Shield, Trash2, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface AdminUser {
	id: string;
	email: string;
	created_at: string;
	last_sign_in?: string;
	mfa_enabled?: boolean;
}

interface Role {
	id: string;
	name: string;
	description: string;
	is_system: boolean;
	permissions: { id: string; domain: string; action: string }[];
}

interface RoleAssignment {
	id: string;
	admin_email: string;
	role_name: string;
	scope?: string;
	created_at: string;
}

interface InviteFormData {
	email: string;
	password: string;
}

export default function TeamPage() {
	const queryClient = useQueryClient();
	const [showInviteDialog, setShowInviteDialog] = useState(false);
	const [showRoleDialog, setShowRoleDialog] = useState(false);
	const [deleteUser, setDeleteUser] = useState<AdminUser | null>(null);
	const [revokeRole, setRevokeRole] = useState<RoleAssignment | null>(null);

	const { data: usersData, isLoading: usersLoading } = useQuery({
		queryKey: QK.adminUsers(),
		queryFn: () => api.get<{ users: AdminUser[] }>("/admin/users"),
	});

	const { data: rolesData, isLoading: rolesLoading } = useQuery({
		queryKey: QK.roles(),
		queryFn: () => api.get<{ roles: Role[] }>("/admin/roles"),
	});

	const { data: assignmentsData, isLoading: assignmentsLoading } = useQuery({
		queryKey: QK.roleAssignments(),
		queryFn: () => api.get<{ assignments: RoleAssignment[] }>("/admin/role-assignments"),
	});

	const { data: projectsData } = useQuery({
		queryKey: QK.projects(),
		queryFn: () => api.get<{ projects: { id: string; name: string }[] }>("/admin/projects"),
	});

	const inviteForm = useState<InviteFormData>({ email: "", password: "" });
	const roleForm = useState<{ adminId: string; roleId: string; projectId: string }>({
		adminId: "",
		roleId: "",
		projectId: "",
	});

	const inviteMutation = useMutation({
		mutationFn: (data: InviteFormData) => api.post("/admin/users", data),
		onSuccess: () => {
			toast.success("Admin user invited");
			setShowInviteDialog(false);
			queryClient.invalidateQueries({ queryKey: QK.adminUsers() });
		},
		onError: (err: any) => toast.error(err.message),
	});

	const deleteMutation = useMutation({
		mutationFn: (id: string) => api.delete(`/admin/users/${id}`),
		onSuccess: () => {
			toast.success("Admin user deleted");
			setDeleteUser(null);
			queryClient.invalidateQueries({ queryKey: QK.adminUsers() });
		},
		onError: (err: any) => toast.error(err.message),
	});

	const assignRoleMutation = useMutation({
		mutationFn: (data: { admin_id: string; role_id: string; project_id?: string }) =>
			api.post("/admin/role-assignments", data),
		onSuccess: () => {
			toast.success("Role assigned");
			setShowRoleDialog(false);
			queryClient.invalidateQueries({ queryKey: QK.roleAssignments() });
		},
		onError: (err: any) => toast.error(err.message),
	});

	const revokeRoleMutation = useMutation({
		mutationFn: (id: string) => api.delete(`/admin/role-assignments/${id}`),
		onSuccess: () => {
			toast.success("Role revoked");
			setRevokeRole(null);
			queryClient.invalidateQueries({ queryKey: QK.roleAssignments() });
		},
		onError: (err: any) => toast.error(err.message),
	});

	if (usersLoading || rolesLoading || assignmentsLoading) return <PageSkeleton />;

	const users = usersData?.users ?? [];
	const roles = rolesData?.roles ?? [];
	const assignments = assignmentsData?.assignments ?? [];
	const isLastAdmin = users.length === 1;

	return (
		<div>
			<PageHeader title="Team" description="Manage admin users and roles" />

			<div className="px-8 pb-8 space-y-8">
				{/* Admin Users */}
				<Card style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
					<CardHeader className="flex flex-row items-center justify-between">
						<div>
							<CardTitle style={{ color: "var(--color-text-primary)" }}>
								<Users size={18} className="inline mr-2" />
								Admin Users
							</CardTitle>
							<CardDescription style={{ color: "var(--color-text-secondary)" }}>
								Manage users who can access the admin dashboard
							</CardDescription>
						</div>
						<Button onClick={() => setShowInviteDialog(true)}>
							<Plus size={16} className="mr-2" />
							Invite User
						</Button>
					</CardHeader>
					<CardContent>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>User</TableHead>
									<TableHead>Created</TableHead>
									<TableHead>Last Login</TableHead>
									<TableHead>MFA</TableHead>
									<TableHead className="text-right">Actions</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{users.map((user) => (
									<TableRow key={user.id}>
										<TableCell>
											<div className="flex items-center gap-3">
												<Avatar email={user.email} size={32} />
												<span style={{ color: "var(--color-text-primary)" }}>{user.email}</span>
											</div>
										</TableCell>
										<TableCell style={{ color: "var(--color-text-secondary)" }}>
											{formatDate(user.created_at)}
										</TableCell>
										<TableCell style={{ color: "var(--color-text-secondary)" }}>
											{user.last_sign_in ? formatDate(user.last_sign_in) : "Never"}
										</TableCell>
										<TableCell>
											{user.mfa_enabled ? (
												<span
													className="px-2 py-0.5 rounded text-xs"
													style={{
														background: "var(--color-success-muted)",
														color: "var(--color-success)",
													}}
												>
													Enabled
												</span>
											) : (
												<span
													className="px-2 py-0.5 rounded text-xs"
													style={{
														background: "var(--color-warning-muted)",
														color: "var(--color-warning)",
													}}
												>
													Not enabled
												</span>
											)}
										</TableCell>
										<TableCell className="text-right">
											<Button
												variant="ghost"
												size="icon"
												disabled={isLastAdmin}
												onClick={() => setDeleteUser(user)}
											>
												<Trash2
													size={16}
													style={{
														color: isLastAdmin ? "var(--color-text-muted)" : "var(--color-danger)",
													}}
												/>
											</Button>
										</TableCell>
									</TableRow>
								))}
								{users.length === 0 && (
									<TableRow>
										<TableCell
											colSpan={5}
											className="text-center py-8"
											style={{ color: "var(--color-text-muted)" }}
										>
											No admin users found
										</TableCell>
									</TableRow>
								)}
							</TableBody>
						</Table>
						{isLastAdmin && (
							<div
								className="mt-4 flex items-center gap-2 p-3 rounded-lg"
								style={{ background: "var(--color-warning-muted)" }}
							>
								<AlertTriangle size={16} style={{ color: "var(--color-warning)" }} />
								<span className="text-sm" style={{ color: "var(--color-warning)" }}>
									You cannot delete the last admin user
								</span>
							</div>
						)}
					</CardContent>
				</Card>

				{/* Role Assignments */}
				<Card style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
					<CardHeader className="flex flex-row items-center justify-between">
						<div>
							<CardTitle style={{ color: "var(--color-text-primary)" }}>
								<Shield size={18} className="inline mr-2" />
								Role Assignments
							</CardTitle>
							<CardDescription style={{ color: "var(--color-text-secondary)" }}>
								Manage role assignments for admin users
							</CardDescription>
						</div>
						<Button onClick={() => setShowRoleDialog(true)}>
							<Plus size={16} className="mr-2" />
							Assign Role
						</Button>
					</CardHeader>
					<CardContent>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Admin</TableHead>
									<TableHead>Role</TableHead>
									<TableHead>Scope</TableHead>
									<TableHead>Assigned</TableHead>
									<TableHead className="text-right">Actions</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{assignments.map((assignment) => (
									<TableRow key={assignment.id}>
										<TableCell style={{ color: "var(--color-text-primary)" }}>
											{assignment.admin_email}
										</TableCell>
										<TableCell>
											<span
												className="px-2 py-0.5 rounded text-xs"
												style={{
													background: "var(--color-brand-muted)",
													color: "var(--color-brand)",
												}}
											>
												{assignment.role_name}
											</span>
										</TableCell>
										<TableCell style={{ color: "var(--color-text-secondary)" }}>
											{assignment.scope ? assignment.scope : "Global"}
										</TableCell>
										<TableCell style={{ color: "var(--color-text-muted)" }}>
											{formatDate(assignment.created_at)}
										</TableCell>
										<TableCell className="text-right">
											<Button variant="ghost" size="icon" onClick={() => setRevokeRole(assignment)}>
												<Trash2 size={16} style={{ color: "var(--color-danger)" }} />
											</Button>
										</TableCell>
									</TableRow>
								))}
								{assignments.length === 0 && (
									<TableRow>
										<TableCell
											colSpan={5}
											className="text-center py-8"
											style={{ color: "var(--color-text-muted)" }}
										>
											No role assignments
										</TableCell>
									</TableRow>
								)}
							</TableBody>
						</Table>
					</CardContent>
				</Card>

				{/* Roles */}
				<Card style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
					<CardHeader>
						<CardTitle style={{ color: "var(--color-text-primary)" }}>
							<Key size={18} className="inline mr-2" />
							Roles
						</CardTitle>
						<CardDescription style={{ color: "var(--color-text-secondary)" }}>
							View available roles and their permissions
						</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="space-y-4">
							{roles.map((role) => (
								<div
									key={role.id}
									className="p-4 rounded-lg"
									style={{ background: "var(--color-surface-elevated)" }}
								>
									<div className="flex items-center justify-between mb-2">
										<div className="flex items-center gap-2">
											<span className="font-medium" style={{ color: "var(--color-text-primary)" }}>
												{role.name}
											</span>
											{role.is_system && (
												<span
													className="px-2 py-0.5 rounded text-xs"
													style={{
														background: "var(--color-text-muted)",
														color: "var(--color-background)",
													}}
												>
													System
												</span>
											)}
										</div>
										<span className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
											{role.description}
										</span>
									</div>
									<div className="flex flex-wrap gap-1">
										{role.permissions.map((perm) => (
											<span
												key={perm.id}
												className="px-2 py-0.5 rounded text-xs"
												style={{
													background: "var(--color-surface)",
													color: "var(--color-text-muted)",
												}}
											>
												{perm.domain}:{perm.action}
											</span>
										))}
										{role.permissions.length === 0 && (
											<span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
												No permissions
											</span>
										)}
									</div>
								</div>
							))}
							{roles.length === 0 && (
								<div className="text-center py-8" style={{ color: "var(--color-text-muted)" }}>
									No roles defined
								</div>
							)}
						</div>
					</CardContent>
				</Card>

				{/* Invite Dialog */}
				<Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
					<DialogContent
						style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
					>
						<DialogHeader>
							<DialogTitle style={{ color: "var(--color-text-primary)" }}>
								Invite Admin User
							</DialogTitle>
							<DialogDescription style={{ color: "var(--color-text-secondary)" }}>
								Create a new admin user account
							</DialogDescription>
						</DialogHeader>
						<form
							onSubmit={(e) => {
								e.preventDefault();
								const formData = new FormData(e.currentTarget);
								inviteMutation.mutate({
									email: formData.get("email") as string,
									password: formData.get("password") as string,
								});
							}}
						>
							<div className="space-y-4 py-4">
								<div className="grid gap-2">
									<Label>Email</Label>
									<Input name="email" type="email" placeholder="admin@example.com" required />
								</div>
								<div className="grid gap-2">
									<Label>Password</Label>
									<Input
										name="password"
										type="password"
										placeholder="Min. 8 characters"
										required
										minLength={8}
									/>
								</div>
							</div>
							<DialogFooter>
								<Button type="button" variant="outline" onClick={() => setShowInviteDialog(false)}>
									Cancel
								</Button>
								<Button type="submit" disabled={inviteMutation.isPending}>
									{inviteMutation.isPending ? "Inviting..." : "Invite"}
								</Button>
							</DialogFooter>
						</form>
					</DialogContent>
				</Dialog>

				{/* Assign Role Dialog */}
				<Dialog open={showRoleDialog} onOpenChange={setShowRoleDialog}>
					<DialogContent
						style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
					>
						<DialogHeader>
							<DialogTitle style={{ color: "var(--color-text-primary)" }}>Assign Role</DialogTitle>
							<DialogDescription style={{ color: "var(--color-text-secondary)" }}>
								Assign a role to an admin user
							</DialogDescription>
						</DialogHeader>
						<form
							onSubmit={(e) => {
								e.preventDefault();
								const formData = new FormData(e.currentTarget);
								assignRoleMutation.mutate({
									admin_id: formData.get("admin_id") as string,
									role_id: formData.get("role_id") as string,
									project_id:
									(formData.get("project_id") as string) === "__global__"
										? undefined
										: (formData.get("project_id") as string) || undefined,
								});
							}}
						>
							<div className="space-y-4 py-4">
								<div className="grid gap-2">
									<Label>Admin User</Label>
									<Select name="admin_id" required>
										<SelectTrigger>
											<SelectValue placeholder="Select admin" />
										</SelectTrigger>
										<SelectContent>
											{users.map((u) => (
												<SelectItem key={u.id} value={u.id}>
													{u.email}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
								<div className="grid gap-2">
									<Label>Role</Label>
									<Select name="role_id" required>
										<SelectTrigger>
											<SelectValue placeholder="Select role" />
										</SelectTrigger>
										<SelectContent>
											{roles.map((r) => (
												<SelectItem key={r.id} value={r.id}>
													{r.name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
								<div className="grid gap-2">
									<Label>Project Scope (optional)</Label>
									<Select name="project_id">
										<SelectTrigger>
											<SelectValue placeholder="Global (no scope)" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="__global__">Global (no scope)</SelectItem>
											{projectsData?.projects?.map((p) => (
												<SelectItem key={p.id} value={p.id}>
													{p.name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
							</div>
							<DialogFooter>
								<Button type="button" variant="outline" onClick={() => setShowRoleDialog(false)}>
									Cancel
								</Button>
								<Button type="submit" disabled={assignRoleMutation.isPending}>
									{assignRoleMutation.isPending ? "Assigning..." : "Assign"}
								</Button>
							</DialogFooter>
						</form>
					</DialogContent>
				</Dialog>

				{/* Delete Confirmation */}
				<ConfirmDialog
					open={!!deleteUser}
					onOpenChange={(open) => !open && setDeleteUser(null)}
					title="Delete Admin User"
					description={`Are you sure you want to delete ${deleteUser?.email}? This action cannot be undone.`}
					confirmLabel="Delete"
					variant="danger"
					onConfirm={() => deleteUser && deleteMutation.mutate(deleteUser.id)}
					loading={deleteMutation.isPending}
				/>

				{/* Revoke Role Confirmation */}
				<ConfirmDialog
					open={!!revokeRole}
					onOpenChange={(open) => !open && setRevokeRole(null)}
					title="Revoke Role"
					description={`Are you sure you want to revoke the ${revokeRole?.role_name} role from ${revokeRole?.admin_email}?`}
					confirmLabel="Revoke"
					variant="danger"
					onConfirm={() => revokeRole && revokeRoleMutation.mutate(revokeRole.id)}
					loading={revokeRoleMutation.isPending}
				/>
			</div>
		</div>
	);
}
