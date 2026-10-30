import { AdminGate } from "@/components/admin-gate";
import { AdminLaunchClient } from "@/components/admin-launch-client";

export const dynamic = "force-dynamic";

export default function AdminLaunchPage() {
  return (
    <AdminGate
      title="Sign in to launch."
      description="Only Clerk users with the admin role can access the launch panel."
    >
      <AdminLaunchClient />
    </AdminGate>
  );
}
