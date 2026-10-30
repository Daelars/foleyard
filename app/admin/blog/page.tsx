import { AdminBlogClient } from "@/components/admin-blog-client";
import { AdminGate } from "@/components/admin-gate";

export const dynamic = "force-dynamic";

export default function AdminBlogPage() {
  return (
    <AdminGate
      title="Sign in to manage the blog."
      description="Only Clerk users with the admin role can access the editor."
    >
      <AdminBlogClient />
    </AdminGate>
  );
}
