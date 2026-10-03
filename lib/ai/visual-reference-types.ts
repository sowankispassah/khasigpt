import type { ImageInput } from "@/lib/ai/image-types";

export type VisualReferenceType =
  | "CHARACTER"
  | "ENVIRONMENT"
  | "LANDMARK"
  | "USER_UPLOAD";

export type VisualReferenceSource = "ADMIN" | "USER" | "WEB";

export type NormalizedVisualReference = {
  type: VisualReferenceType;
  source: VisualReferenceSource;
  image: ImageInput;
  entity?: string;
  characterId?: string;
  imageUrl?: string;
  sourceUrl?: string;
  sourceDomain?: string;
  searchQuery?: string;
  retrievedAt?: string;
  relevance?: number;
  width?: number;
  height?: number;
};

export type PersistedEnvironmentReference = Omit<
  NormalizedVisualReference,
  "image" | "source" | "type"
> & {
  type: "ENVIRONMENT" | "LANDMARK";
  source: "WEB";
  imageUrl: string;
  entity: string;
  searchQuery: string;
  retrievedAt: string;
};

export type EnvironmentReferenceContext = {
  entity: string;
  entityType: "PLACE" | "LANDMARK" | "BUILDING" | "VENUE" | "NATURAL_LOCATION";
  searchQuery: string;
  retrievedAt: string;
  references: PersistedEnvironmentReference[];
};
