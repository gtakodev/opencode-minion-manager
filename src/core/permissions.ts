import type { HostPermissions, Profile } from "./types.js";

export type EffectivePermissions = HostPermissions & {
  delegate: boolean;
  reportDestination?: string;
};

export function permissionsFor(
  profile: Profile | "Manager",
  host: HostPermissions,
  reportDestination?: string,
): EffectivePermissions {
  const base = {
    read: host.read,
    web: false,
    shell: false,
    edit: false,
    delegate: false,
  };
  switch (profile) {
    case "Manager":
      return { ...base, delegate: true };
    case "minion/research":
      return { ...base, web: host.web };
    case "minion/verify":
      return { ...base, shell: host.shell };
    case "minion/implement":
      return { ...base, shell: host.shell, edit: host.edit };
    case "minion/report":
      return {
        ...base,
        edit: host.edit && reportDestination !== undefined,
        ...(reportDestination ? { reportDestination } : {}),
      };
    default:
      return base;
  }
}

export function requiresWriteEscalation(
  from: "review" | "research" | "implement",
  to: "review" | "research" | "implement",
): boolean {
  return from !== "implement" && to === "implement";
}
