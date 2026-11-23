import { prepareDatabase } from "../scripts/prepare-db.ts";

export default async function setup() {
  await prepareDatabase(
    process.env["TEST_DATABASE_URL"] ?? "postgresql://lance:lance@localhost:5439/lance_test",
  );
}
