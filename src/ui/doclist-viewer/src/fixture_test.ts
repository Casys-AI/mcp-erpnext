import { assertEquals, assertStrictEquals } from "@std/assert";
import {
  COMPANY_DOCLIST_FIXTURE,
  DOCLIST_FIXTURE,
  doclistFixtureFromSearch,
  isFixtureMode,
} from "./fixture.ts";

Deno.test("doclist fixture keeps the invoice scenario as the default", () => {
  assertStrictEquals(doclistFixtureFromSearch("?fixture=1"), DOCLIST_FIXTURE);
});

Deno.test("doclist fixture exposes the Company regression scenario", () => {
  const fixture = doclistFixtureFromSearch("?fixture=company");
  assertStrictEquals(fixture, COMPANY_DOCLIST_FIXTURE);
  assertEquals(fixture.doctype, "Company");
  assertEquals(fixture._rowAction, {
    toolName: "erpnext_doc_get",
    idField: "name",
    argName: "name",
    extraArgs: { doctype: "Company" },
  });
  assertEquals(
    Object.keys(fixture.data[0]).filter((key) => !key.startsWith("_")),
    [
      "name",
      "abbr",
      "default_currency",
      "country",
      "domain",
    ],
  );
});

Deno.test("doclist fixture mode is explicit", () => {
  assertEquals(isFixtureMode("?fixture=company"), true);
  assertEquals(isFixtureMode("?layout=panel"), false);
});
