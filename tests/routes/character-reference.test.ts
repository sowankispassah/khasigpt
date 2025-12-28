import { expect, test } from "@playwright/test";
import {
  MAX_CHARACTER_REFS,
  buildCharacterReference,
} from "@/lib/ai/character-reference";
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
  expect(result.referenceImages?.length ?? 0).toBeLessThanOrEqual(
    MAX_CHARACTER_REFS
  );
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
  expect(result.referenceImages?.length ?? 0).toBe(1);
});
