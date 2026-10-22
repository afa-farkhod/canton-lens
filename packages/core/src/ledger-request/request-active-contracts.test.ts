// **The spelling of the active-contracts question.** Canton 3.6 refuses the filter and `verbose` at the top
// of the body (the 3.4 spelling); they go under `eventFormat`. The tape cannot catch a slide back — it keys
// both spellings as one question (apps/backend/src/check/ledger-tape.ts) — so the body is pinned here.
import assert from "node:assert/strict";
import test from "node:test";
import { buildGetActiveContractsRequest } from "./request-active-contracts.ts";

const WILDCARD = {
  identifierFilter: { WildcardFilter: { value: { includeCreatedEventBlob: false } } },
};

test("the filter and verbose sit under eventFormat, and nowhere else", () => {
  const request = buildGetActiveContractsRequest({ parties: ["alice::1220"] }, 161);
  assert.equal(request.method, "POST");
  assert.equal(request.path, "/v2/state/active-contracts?limit=200");
  assert.deepEqual(request.body, {
    eventFormat: { filtersByParty: { "alice::1220": { cumulative: [WILDCARD] } }, verbose: true },
    activeAtOffset: 161,
  });
});

test("a super reader asks with filtersForAnyParty under eventFormat, naming nobody", () => {
  const request = buildGetActiveContractsRequest({ anyParty: true }, 161);
  assert.deepEqual(request.body, {
    eventFormat: {
      filtersByParty: {},
      filtersForAnyParty: { cumulative: [WILDCARD] },
      verbose: true,
    },
    activeAtOffset: 161,
  });
});

test("an interface view is asked for inside the same format, and the cursor goes beside it", () => {
  const request = buildGetActiveContractsRequest(
    { parties: ["alice::1220"] },
    161,
    "#pkg:Mod:Iface",
    "cursor-1",
  );
  const body = request.body as {
    eventFormat: { filtersByParty: Record<string, { cumulative: unknown[] }> };
    streamContinuationToken?: string;
  };
  assert.deepEqual(body.eventFormat.filtersByParty["alice::1220"]?.cumulative, [
    {
      identifierFilter: {
        InterfaceFilter: {
          value: {
            interfaceId: "#pkg:Mod:Iface",
            includeInterfaceView: true,
            includeCreatedEventBlob: false,
          },
        },
      },
    },
  ]);
  assert.equal(body.streamContinuationToken, "cursor-1");
});
