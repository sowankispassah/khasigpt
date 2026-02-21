import { AdminCharactersManager } from "@/components/admin-characters-manager";
import { listCharactersForAdmin } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default async function AdminCharactersPage() {
  const characters = await listCharactersForAdmin();

  const serialized = characters.map((character) => ({
    ...character,
    createdAt:
      character.createdAt instanceof Date
        ? character.createdAt.toISOString()
        : String(character.createdAt),
    updatedAt:
      character.updatedAt instanceof Date
        ? character.updatedAt.toISOString()
        : String(character.updatedAt),
  }));

  return <AdminCharactersManager characters={serialized} />;
}
