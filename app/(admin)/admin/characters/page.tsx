import nextDynamic from "next/dynamic";
import { AdminPageLoading } from "@/components/admin/admin-page-loading";
import { listCharactersForAdmin } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

const AdminCharactersManager = nextDynamic(
  () =>
    import("@/components/admin-characters-manager").then(
      (module) => module.AdminCharactersManager
    ),
  {
    loading: () => <AdminPageLoading rows={7} titleWidth="w-44" />,
  }
);

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
