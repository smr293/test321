import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { gymLocations, orgMembers, organizations, users, type Organization, type OrgMember, type User } from "@/db/schema";
import { ORG_COOKIE } from "./env";
import { getSession, type SessionInfo } from "./session";

/* ------------------------------------------------------------------ */
/* Permission model                                                    */
/* ------------------------------------------------------------------ */

export const PERMISSIONS = [
  "org:manage",
  "staff:manage",
  "members:read",
  "members:write",
  "memberships:manage",
  "billing:read",
  "billing:manage",
  "classes:manage",
  "bookings:manage",
  "attendance:manage",
  "coaches:manage",
  "fighters:read",
  "programs:manage",
  "fightcamps:manage",
  "analytics:read",
  "announcements:send",
  "messages:send",
] as const;

export type Permission = (typeof PERMISSIONS)[number];
export type OrgRole = "owner" | "manager" | "coach" | "fighter";

const MANAGER_DEFAULTS: Permission[] = [
  "members:read",
  "members:write",
  "memberships:manage",
  "billing:read",
  "classes:manage",
  "bookings:manage",
  "attendance:manage",
  "coaches:manage",
  "fighters:read",
  "programs:manage",
  "fightcamps:manage",
  "analytics:read",
  "announcements:send",
  "messages:send",
];

const ROLE_PERMISSIONS: Record<OrgRole, Permission[]> = {
  owner: [...PERMISSIONS],
  manager: MANAGER_DEFAULTS,
  coach: [
    "fighters:read",
    "classes:manage",
    "bookings:manage",
    "attendance:manage",
    "programs:manage",
    "fightcamps:manage",
    "messages:send",
    "analytics:read",
  ],
  fighter: [],
};

/** Effective permissions for a role, optionally overridden per manager. */
export function effectivePermissions(role: OrgRole, overrides?: string | null): Set<Permission> {
  if (role === "owner") return new Set(PERMISSIONS);
  if (role === "fighter") return new Set<Permission>();
  let base = [...ROLE_PERMISSIONS[role]];
  if (role === "manager" && overrides) {
    try {
      const parsed = JSON.parse(overrides);
      if (Array.isArray(parsed)) base = parsed.filter((p): p is Permission => PERMISSIONS.includes(p));
    } catch {
      /* keep defaults */
    }
  }
  // Coaches can never gain management-level permissions.
  if (role === "coach") base = base.filter((p) => !["org:manage", "staff:manage", "billing:manage", "billing:read"].includes(p));
  return new Set(base);
}

export function can(role: OrgRole, permission: Permission, overrides?: string | null): boolean {
  return effectivePermissions(role, overrides).has(permission);
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

export class ForbiddenError extends AuthError {
  constructor(message = "You do not have access to this") {
    super(message, 403);
  }
}

/* ------------------------------------------------------------------ */
/* Session resolution                                                  */
/* ------------------------------------------------------------------ */

export type OrgSummary = {
  org: Organization;
  membership: OrgMember;
  role: OrgRole;
};

export type AuthState = {
  user: User;
  session: SessionInfo;
  memberships: OrgSummary[];
  activeOrg: OrgSummary | null;
  isSuperAdmin: boolean;
  superAdminOrg: Organization | null;
  /** True when a super admin is viewing a gym they are not a member of. */
  supportMode: boolean;
};

export async function getAuth(): Promise<AuthState | null> {
  const session = await getSession();
  if (!session) return null;
  const rows = await db
    .select({ membership: orgMembers, org: organizations })
    .from(orgMembers)
    .innerJoin(organizations, eq(organizations.id, orgMembers.orgId))
    .where(
      and(
        eq(orgMembers.userId, session.user.id),
        ne(orgMembers.status, "archived"),
        isNull(orgMembers.archivedAt),
      ),
    );
  const memberships: OrgSummary[] = rows
    .filter((r) => r.org.status !== "archived")
    .map((r) => ({ org: r.org, membership: r.membership, role: r.membership.role as OrgRole }));

  const jar = await cookies();
  const requestedOrgId = jar.get(ORG_COOKIE)?.value;
  let activeOrg =
    memberships.find((m) => m.org.id === requestedOrgId) ??
    memberships.find((m) => m.role === "owner") ??
    memberships[0] ??
    null;

  // Restricted accounts (suspended gyms) can still sign in but lose gym access.
  const isSuperAdmin = session.user.isSuperAdmin;
  let superAdminOrg: Organization | null = null;
  let supportMode = false;
  if (isSuperAdmin && requestedOrgId && (!activeOrg || activeOrg.org.id !== requestedOrgId)) {
    const org = await db.select().from(organizations).where(eq(organizations.id, requestedOrgId)).limit(1);
    if (org[0]) {
      superAdminOrg = org[0];
      supportMode = true;
    }
  }

  return { user: session.user, session, memberships, activeOrg, isSuperAdmin, superAdminOrg, supportMode };
}

export async function requireUser(): Promise<AuthState> {
  const auth = await getAuth();
  if (!auth) throw new AuthError("Please sign in to continue", 401);
  return auth;
}

/* ------------------------------------------------------------------ */
/* Organization context                                                */
/* ------------------------------------------------------------------ */

export type OrgContext = {
  auth: AuthState;
  user: User;
  org: Organization;
  role: OrgRole;
  membership: OrgMember | null;
  permissions: Set<Permission>;
  locations: (typeof gymLocations.$inferSelect)[];
  supportMode: boolean;
  isOwner: boolean;
};

export async function getOrgContext(orgId?: string): Promise<OrgContext | null> {
  const auth = await getAuth();
  if (!auth) return null;

  let org: Organization | null = null;
  let membership: OrgMember | null = null;
  let role: OrgRole = "fighter";
  let supportMode = false;

  if (orgId) {
    const matched = auth.memberships.find((m) => m.org.id === orgId);
    if (matched) {
      org = matched.org;
      membership = matched.membership;
      role = matched.role;
    } else if (auth.isSuperAdmin) {
      // Explicit support access, always audited by the calling action.
      const row = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
      org = row[0] ?? null;
      role = "owner";
      supportMode = true;
    } else {
      return null; // tenant isolation: no membership, no access
    }
  } else if (auth.supportMode && auth.superAdminOrg) {
    org = auth.superAdminOrg;
    role = "owner";
    supportMode = true;
  } else if (auth.activeOrg) {
    org = auth.activeOrg.org;
    membership = auth.activeOrg.membership;
    role = auth.activeOrg.role;
  }

  if (!org) return null;

  const locations = await db
    .select()
    .from(gymLocations)
    .where(and(eq(gymLocations.orgId, org.id), isNull(gymLocations.archivedAt)));

  return {
    auth,
    user: auth.user,
    org,
    role,
    membership,
    // Platform support mode is read-only: no mutation permission is granted.
    permissions: supportMode ? new Set<Permission>() : effectivePermissions(role, membership?.permissions ?? null),
    locations,
    supportMode,
    isOwner: role === "owner",
  };
}

/** Page guard: redirects to sign-in or to the member app instead of throwing. */
export async function requireOrgPage(orgId?: string): Promise<OrgContext> {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  const ctx = await getOrgContext(orgId);
  if (!ctx) {
    if (auth.memberships.some((m) => m.role === "owner" || m.role === "manager" || m.role === "coach")) {
      redirect("/gym");
    }
    redirect("/app");
  }
  return ctx;
}

/** Action guard: throws 403 when the user lacks the permission. */
export async function requireOrgPermission(orgId: string | undefined, permission: Permission): Promise<OrgContext> {
  const ctx = await getOrgContext(orgId);
  if (!ctx) throw new ForbiddenError("You do not have access to this gym");
  if (ctx.org.status === "suspended") {
    throw new ForbiddenError("This gym is suspended. Contact support.");
  }
  if (ctx.supportMode) {
    throw new ForbiddenError("Support mode is read-only. Exit support mode to make changes.");
  }
  if (!ctx.permissions.has(permission)) {
    throw new ForbiddenError(`Missing permission: ${permission}`);
  }
  return ctx;
}

export async function requireSuperAdmin(): Promise<AuthState> {
  const auth = await requireUser();
  if (!auth.isSuperAdmin) throw new ForbiddenError("Super admin access required");
  return auth;
}

/* ------------------------------------------------------------------ */
/* Membership lookups with tenant checks                               */
/* ------------------------------------------------------------------ */

export async function getMemberForUser(userId: string, orgId: string): Promise<OrgMember | null> {
  const rows = await db
    .select()
    .from(orgMembers)
    .where(and(eq(orgMembers.userId, userId), eq(orgMembers.orgId, orgId)))
    .limit(1);
  return rows[0] ?? null;
}

/** Loads a member and asserts it belongs to the given gym (prevents cross-tenant reads). */
export async function getTenantMember(orgId: string, memberId: string) {
  const rows = await db
    .select({ member: orgMembers, user: users })
    .from(orgMembers)
    .innerJoin(users, eq(users.id, orgMembers.userId))
    .where(and(eq(orgMembers.id, memberId), eq(orgMembers.orgId, orgId)))
    .limit(1);
  if (!rows[0]) throw new ForbiddenError("Member not found in this gym");
  return rows[0];
}

export async function getCoachAthleteIds(orgId: string, coachMemberId: string): Promise<string[]> {
  const { coachAssignments } = await import("@/db/schema");
  const rows = await db
    .select({ id: coachAssignments.fighterMemberId })
    .from(coachAssignments)
    .where(and(eq(coachAssignments.orgId, orgId), eq(coachAssignments.coachMemberId, coachMemberId)));
  return rows.map((r) => r.id);
}

/** The coaches (trainers) assigned to an athlete — the other half of the coach↔athlete link. */
export async function getAthleteCoaches(orgId: string, fighterMemberId: string) {
  const { coachAssignments } = await import("@/db/schema");
  return db
    .select({
      assignment: coachAssignments,
      member: orgMembers,
      user: users,
    })
    .from(coachAssignments)
    .innerJoin(orgMembers, eq(orgMembers.id, coachAssignments.coachMemberId))
    .innerJoin(users, eq(users.id, orgMembers.userId))
    .where(and(eq(coachAssignments.orgId, orgId), eq(coachAssignments.fighterMemberId, fighterMemberId)));
}

/**
 * Coaches may only act on athletes explicitly assigned to them.
 * Owners/managers are not restricted by assignments.
 */
export async function assertCoachOwnsFighter(orgId: string, coachMemberId: string, fighterMemberId: string) {
  const { coachAssignments } = await import("@/db/schema");
  const row = (
    await db
      .select({ id: coachAssignments.id })
      .from(coachAssignments)
      .where(
        and(
          eq(coachAssignments.orgId, orgId),
          eq(coachAssignments.coachMemberId, coachMemberId),
          eq(coachAssignments.fighterMemberId, fighterMemberId),
        ),
      )
      .limit(1)
  )[0];
  if (!row) throw new ForbiddenError("You can only access athletes assigned to you.");
}

export async function findUserOrgIds(userId: string): Promise<string[]> {
  const rows = await db.select({ orgId: orgMembers.orgId }).from(orgMembers).where(eq(orgMembers.userId, userId));
  return rows.map((r) => r.orgId);
}

export async function membersOfOrg(orgId: string, ids: string[]) {
  if (!ids.length) return [];
  return db.select().from(orgMembers).where(and(eq(orgMembers.orgId, orgId), inArray(orgMembers.id, ids)));
}
