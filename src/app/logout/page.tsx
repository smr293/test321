import { logoutAction } from "@/lib/actions/auth";

export default function LogoutPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <form action={logoutAction}>
        <button type="submit" className="btn btn-primary">Sign out</button>
      </form>
    </main>
  );
}
