export type CapabilityProfile =
  | "full"
  | "serverTools-only"
  | "context-only"
  | "message-only"
  | "none";

export type HostChannel =
  | "serverTools"
  | "downloadFile"
  | "updateModelContext"
  | "message";

export interface DevHostCapabilities {
  serverTools?: Record<string, never>;
  downloadFile?: Record<string, never>;
  updateModelContext?: {
    text: Record<string, never>;
    resource?: Record<string, never>;
  };
  message?: { text: Record<string, never> };
}

const PROFILE_ALIASES: Record<string, CapabilityProfile> = {
  full: "full",
  "serverTools-only": "serverTools-only",
  "context-only": "context-only",
  "message-only": "message-only",
  none: "none",
  // Anciennes URLs du dev-host.
  tools: "full",
  context: "context-only",
  message: "message-only",
};

export function resolveCapabilityProfile(
  value: string | null | undefined,
): CapabilityProfile | null {
  if (!value) return null;
  return PROFILE_ALIASES[value] ?? null;
}

export function capabilitiesForProfile(
  profile: CapabilityProfile,
): DevHostCapabilities {
  switch (profile) {
    case "full":
      return {
        serverTools: {},
        downloadFile: {},
        updateModelContext: { text: {}, resource: {} },
        message: { text: {} },
      };
    case "serverTools-only":
      return { serverTools: {} };
    case "context-only":
      return { updateModelContext: { text: {}, resource: {} } };
    case "message-only":
      return { message: { text: {} } };
    case "none":
      return {};
  }
}

export function channelsForProfile(profile: CapabilityProfile): HostChannel[] {
  return Object.keys(capabilitiesForProfile(profile)) as HostChannel[];
}
