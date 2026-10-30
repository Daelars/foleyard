import { AdminGate } from "@/components/admin-gate";
import { AdminSiteClient } from "@/components/admin-site-client";

export const dynamic = "force-dynamic";

export default async function AdminSitePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const { page } = await searchParams;
  const requestedPage = Array.isArray(page) ? page[0] : page;

  return (
    <AdminGate
      title="Sign in to manage the site."
      description="Only Clerk users with the admin role can access the site settings."
    >
      <AdminSiteClient initialPageSlug={requestedPage} />
    </AdminGate>
  );
}
