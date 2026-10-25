import { ensureDevAdmin } from "../src/lib/bootstrap";

async function main() {
  const id = await ensureDevAdmin();
  console.log(id ?? "not created");
}
main();
