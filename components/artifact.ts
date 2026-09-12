export type ArtifactKind = "text" | "code" | "sheet" | "image";

// Artifact feature removed; keep empty definitions to satisfy type imports.
export const artifactDefinitions: { kind: ArtifactKind; toolbar?: unknown[] }[] =
  [];

export const artifactKinds: ArtifactKind[] = ["text", "code", "sheet", "image"];
