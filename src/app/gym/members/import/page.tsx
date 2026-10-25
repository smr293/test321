import { redirect } from "next/navigation";
import { Card, CardHeader, Field, PageHeader, Textarea, Callout } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/client";
import { requireOrgPage } from "@/lib/authz";
import { importMembersAction } from "@/lib/actions/gym";

export const metadata = { title: "Import members" };

export default async function ImportMembersPage() {
  const ctx = await requireOrgPage();
  if (!ctx.permissions.has("members:write")) redirect("/gym/members?error=You+cannot+import+members");
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageHeader title="Import members" description="Paste a CSV with columns: email, name, phone (optional)." />
      <Card>
        <CardHeader title="CSV data" description="First row may contain headers. Existing accounts are linked, duplicates skipped." />
        <form action={importMembersAction} className="mt-4 space-y-3">
          <input type="hidden" name="orgId" value={ctx.org.id} />
          <Field label="CSV" htmlFor="csv">
            <Textarea id="csv" name="csv" required className="min-h-56 font-mono text-xs" placeholder={"email,name,phone\nalex@example.com,Alex Nord,+46700000000\nlina@example.com,Lina Okoye,"} />
          </Field>
          <Callout tone="info">
            New accounts get an invitation email so each member can set their own password. Plan limits are enforced
            during import.
          </Callout>
          <SubmitButton>Import members</SubmitButton>
        </form>
      </Card>
    </div>
  );
}
