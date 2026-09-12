import { expect, test } from "@playwright/test";
import {
  buildCharacterReference,
  detectCharacters,
  MAX_CHARACTER_REFS,
  MAX_TOTAL_CHARACTER_REFS,
  selectRefImages,
} from "@/lib/ai/character-reference-core";
import type { CharacterReferenceImage } from "@/lib/ai/character-reference-types";
import {
  hasFrontReference,
  normalizeCharacterReferences,
} from "@/lib/ai/character-reference-types";
import type { CharacterRefImage } from "@/lib/db/schema";

test("buildCharacterReference caps refs and uses only matched character images", async () => {
  const matchedCharacterId = "character-1";
  const otherCharacterId = "character-2";

  const matchedRefImages: CharacterRefImage[] = [
    {
      imageId: "img-1",
      mimeType: "image/png",
      isPrimary: true,
      role: "face",
      updatedAt: "2024-06-01T00:00:00Z",
    },
    {
      imageId: "img-2",
      mimeType: "image/png",
      isPrimary: true,
      role: "fullbody",
      updatedAt: "2023-06-01T00:00:00Z",
    },
    {
      imageId: "img-3",
      mimeType: "image/png",
      isPrimary: true,
      role: "face",
      updatedAt: "2024-07-01T00:00:00Z",
    },
    {
      imageId: "img-4",
      mimeType: "image/png",
      isPrimary: true,
      role: "attire",
      updatedAt: "2022-06-01T00:00:00Z",
    },
  ];

  const otherRefImages: CharacterRefImage[] = [
    {
      imageId: "other-1",
      mimeType: "image/png",
      isPrimary: true,
      role: "face",
      updatedAt: "2024-01-01T00:00:00Z",
    },
  ];

  const fetchedIds: string[] = [];

  const result = await buildCharacterReference({
    prompt: "Generate a photo of Tirot Sing",
    deps: {
      listAliasIndex: async () => [
        { aliasNormalized: "tirot sing", characterId: matchedCharacterId },
        { aliasNormalized: "characterb", characterId: otherCharacterId },
      ],
      getCharactersByIds: async (ids) =>
        ids.map((id) => ({
          id,
          priority: id === matchedCharacterId ? 5 : 0,
          enabled: true,
          refImages: id === matchedCharacterId ? matchedRefImages : otherRefImages,
        })),
      getCharacterById: async (id) => {
        if (id !== matchedCharacterId) {
          throw new Error("Unexpected character lookup");
        }
        return {
          id,
          canonicalName: "Tirot Sing",
          refImages: matchedRefImages,
          lockedPrompt: null,
          negativePrompt: null,
          gender: null,
          height: null,
          weight: null,
          complexion: null,
          enabled: true,
          priority: 5,
        };
      },
      fetchReferenceImage: async (ref) => {
        if (ref.imageId) {
          fetchedIds.push(ref.imageId);
        }
        return { data: "fake", mediaType: "image/png" };
      },
    },
  });

  expect(result.matchedCharacterId).toBe(matchedCharacterId);
  expect(result.matchedCharacterIds).toEqual([matchedCharacterId]);
  expect(result.referenceImages?.length ?? 0).toBeLessThanOrEqual(
    MAX_CHARACTER_REFS
  );
  expect(result.referenceImages).toHaveLength(MAX_CHARACTER_REFS);
  expect(result.prompt).toContain("REFERENCE IMAGE GUIDANCE:");
  expect(result.prompt).toContain("Reference image 1: Tirot Sing");
  expect(
    fetchedIds.every((id) =>
      matchedRefImages.some((ref) => ref.imageId === id)
    )
  ).toBeTruthy();
});

test("buildCharacterReference treats alias-only prompt as identity", async () => {
  const matchedCharacterId = "character-1";
  const matchedRefImages: CharacterRefImage[] = [
    {
      imageId: "img-1",
      mimeType: "image/png",
      isPrimary: true,
      role: "face",
      updatedAt: "2024-06-01T00:00:00Z",
    },
  ];

  const result = await buildCharacterReference({
    prompt: "Tirot Sing in timesquare at night",
    deps: {
      listAliasIndex: async () => [
        { aliasNormalized: "tirot sing", characterId: matchedCharacterId },
      ],
      getCharactersByIds: async () => [
        {
          id: matchedCharacterId,
          priority: 0,
          enabled: true,
          refImages: matchedRefImages,
        },
      ],
      getCharacterById: async () => ({
        id: matchedCharacterId,
        canonicalName: "Tirot Sing",
        refImages: matchedRefImages,
        lockedPrompt: null,
        negativePrompt: null,
        gender: null,
        height: null,
        weight: null,
        complexion: null,
        enabled: true,
        priority: 0,
      }),
      fetchReferenceImage: async () => ({ data: "fake", mediaType: "image/png" }),
    },
  });

  expect(result.matchedCharacterId).toBe(matchedCharacterId);
  expect(result.matchedCharacterIds).toEqual([matchedCharacterId]);
  expect(result.referenceImages?.length ?? 0).toBe(1);
});

test("buildCharacterReference attaches refs for multiple matches", async () => {
  const characterA = "character-1";
  const characterB = "character-2";

  const refsA: CharacterRefImage[] = [
    {
      imageId: "a-1",
      mimeType: "image/png",
      isPrimary: true,
      role: "face",
      updatedAt: "2024-06-01T00:00:00Z",
    },
    {
      imageId: "a-2",
      mimeType: "image/png",
      isPrimary: true,
      role: "fullbody",
      updatedAt: "2024-05-01T00:00:00Z",
    },
  ];

  const refsB: CharacterRefImage[] = [
    {
      imageId: "b-1",
      mimeType: "image/png",
      isPrimary: true,
      role: "face",
      updatedAt: "2024-06-02T00:00:00Z",
    },
  ];

  const fetchedIds: string[] = [];

  const result = await buildCharacterReference({
    prompt: "Tirot Sing flying in Shillong city",
    deps: {
      listAliasIndex: async () => [
        { aliasNormalized: "tirot sing", characterId: characterA },
        { aliasNormalized: "shillong city", characterId: characterB },
      ],
      getCharactersByIds: async (ids) =>
        ids.map((id) => ({
          id,
          priority: 0,
          enabled: true,
          refImages: id === characterA ? refsA : refsB,
        })),
      getCharacterById: async (id) => ({
        id,
        canonicalName: id === characterA ? "Tirot Sing" : "Shillong City",
        refImages: id === characterA ? refsA : refsB,
        lockedPrompt: null,
        negativePrompt: null,
        gender: null,
        height: null,
        weight: null,
        complexion: null,
        enabled: true,
        priority: 0,
      }),
      fetchReferenceImage: async (ref) => {
        if (ref.imageId) {
          fetchedIds.push(ref.imageId);
        }
        return { data: "fake", mediaType: "image/png" };
      },
    },
  });

  expect(result.matchedCharacterIds?.sort()).toEqual(
    [characterA, characterB].sort()
  );
  expect(result.referenceImages?.length ?? 0).toBeLessThanOrEqual(
    MAX_TOTAL_CHARACTER_REFS
  );
  expect(
    fetchedIds.every(
      (id) =>
        refsA.some((ref) => ref.imageId === id) ||
        refsB.some((ref) => ref.imageId === id)
    )
  ).toBeTruthy();
});

test("buildCharacterReference keeps healthy refs when one ref fails", async () => {
  const characterId = "character-1";
  const refImages: CharacterRefImage[] = [
    {
      imageId: "front",
      mimeType: "image/png",
      isPrimary: true,
      role: "front face",
      updatedAt: "2024-06-03T00:00:00Z",
    },
    {
      imageId: "left",
      mimeType: "image/png",
      isPrimary: true,
      role: "left profile",
      updatedAt: "2024-06-02T00:00:00Z",
    },
    {
      imageId: "right",
      mimeType: "image/png",
      isPrimary: true,
      role: "right profile",
      updatedAt: "2024-06-01T00:00:00Z",
    },
  ];

  const result = await buildCharacterReference({
    prompt: "Generate a photo of Tirot Sing",
    deps: {
      listAliasIndex: async () => [
        { aliasNormalized: "tirot sing", characterId },
      ],
      getCharactersByIds: async () => [
        { id: characterId, priority: 0, enabled: true, refImages },
      ],
      getCharacterById: async () => ({
        id: characterId,
        canonicalName: "Tirot Sing",
        refImages,
        lockedPrompt: null,
        negativePrompt: null,
        gender: null,
        height: null,
        weight: null,
        complexion: null,
        enabled: true,
        priority: 0,
      }),
      fetchReferenceImage: async (ref) =>
        ref.imageId === "left"
          ? null
          : { data: ref.imageId ?? "unknown", mediaType: "image/png" },
    },
  });

  expect(result.referenceImages).toHaveLength(2);
  expect(result.prompt).toContain("view/role: front face");
  expect(result.prompt).toContain("view/role: right profile");
  expect(result.prompt).not.toContain("view/role: left profile");
});

test("buildCharacterReference stops when every configured ref fails", async () => {
  const characterId = "character-1";
  const refImages: CharacterRefImage[] = [
    {
      imageId: "front",
      mimeType: "image/png",
      isPrimary: true,
      role: "front face",
    },
  ];

  await expect(
    buildCharacterReference({
      prompt: "Generate a photo of Tirot Sing",
      deps: {
        listAliasIndex: async () => [
          { aliasNormalized: "tirot sing", characterId },
        ],
        getCharactersByIds: async () => [
          { id: characterId, priority: 0, enabled: true, refImages },
        ],
        getCharacterById: async () => ({
          id: characterId,
          canonicalName: "Tirot Sing",
          refImages,
          lockedPrompt: null,
          negativePrompt: null,
          gender: null,
          height: null,
          weight: null,
          complexion: null,
          enabled: true,
          priority: 0,
        }),
        fetchReferenceImage: async () => null,
      },
    })
  ).rejects.toThrow("No configured character reference images could be loaded.");
});

test("buildCharacterReference leaves complexion to the reference images", async () => {
  const characterId = "character-1";
  const refImages: CharacterRefImage[] = [
    {
      imageId: "front",
      mimeType: "image/png",
      isPrimary: true,
      role: "front face",
    },
  ];

  const result = await buildCharacterReference({
    prompt: "Generate a photo of Tirot Sing",
    deps: {
      listAliasIndex: async () => [
        { aliasNormalized: "tirot sing", characterId },
      ],
      getCharactersByIds: async () => [
        { id: characterId, priority: 0, enabled: true, refImages },
      ],
      getCharacterById: async () => ({
        id: characterId,
        canonicalName: "Tirot Sing",
        refImages,
        lockedPrompt: null,
        negativePrompt: null,
        gender: "male",
        height: "180 cm",
        weight: "75 kg",
        complexion: "medium brown",
        enabled: true,
        priority: 0,
      }),
      fetchReferenceImage: async () => ({
        data: "front",
        mediaType: "image/png",
      }),
    },
  });

  expect(result.prompt).toContain("gender: male");
  expect(result.prompt).toContain("height: 180 cm");
  expect(result.prompt).toContain("weight: 75 kg");
  expect(result.prompt).not.toContain("skin tone");
  expect(result.prompt).not.toContain("medium brown");
});

test("detectCharacters does not use the hidden priority value", async () => {
  const matches = await detectCharacters({
    prompt: "Generate Alpha Beta and Gamma Zeta",
    aliasIndex: [
      { aliasNormalized: "alpha beta", characterId: "character-a" },
      { aliasNormalized: "gamma zeta", characterId: "character-b" },
    ],
    getCharactersByIds: async () => [
      {
        id: "character-a",
        priority: 0,
        enabled: true,
        refImages: [
          { imageId: "a-1", mimeType: "image/png" },
          { imageId: "a-2", mimeType: "image/png" },
        ],
      },
      {
        id: "character-b",
        priority: 100,
        enabled: true,
        refImages: [{ imageId: "b-1", mimeType: "image/png" }],
      },
    ],
  });

  expect(matches.map(({ characterId }) => characterId)).toEqual([
    "character-a",
    "character-b",
  ]);
});

test("normalizes legacy references without losing the first identity image", () => {
  const normalized = normalizeCharacterReferences([
    { imageId: "legacy-front", mimeType: "image/png" },
    { imageId: "legacy-extra", mimeType: "image/png", role: "attire" },
  ]);

  expect(normalized[0]).toMatchObject({
    category: "identity",
    type: "front",
  });
  expect(normalized[1]).toMatchObject({
    category: "additional",
    type: "other",
  });
  expect(hasFrontReference(normalized)).toBeTruthy();
});

test("selects requested expression and angle while keeping the front anchor", () => {
  const refs = [
    {
      imageId: "front",
      mimeType: "image/png",
      category: "identity" as const,
      type: "front" as const,
    },
    {
      imageId: "left",
      mimeType: "image/png",
      category: "identity" as const,
      type: "left" as const,
    },
    {
      imageId: "smile",
      mimeType: "image/png",
      category: "expression" as const,
      type: "smile" as const,
    },
    {
      imageId: "other",
      mimeType: "image/png",
      category: "additional" as const,
      type: "other" as const,
    },
  ];

  const selected = selectRefImages(refs, 3, "smiling left profile portrait");
  expect(selected.map((ref) => ref.imageId)).toEqual([
    "front",
    "smile",
    "left",
  ]);
});

test("falls back to identity references when a requested expression is unavailable", () => {
  const selected = selectRefImages(
    [
      {
        imageId: "front",
        mimeType: "image/png",
        category: "identity",
        type: "front",
      },
      {
        imageId: "right",
        mimeType: "image/png",
        category: "identity",
        type: "right",
      },
    ] as CharacterReferenceImage[],
    3,
    "laughing portrait"
  );

  expect(selected.map((ref) => ref.imageId)).toEqual(["front", "right"]);
});
