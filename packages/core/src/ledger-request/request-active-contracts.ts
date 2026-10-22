import {
  collectLedgerPages,
  LEDGER_PAGE_SIZE,
  type LedgerPageCursor,
  withPageLimit,
} from "./paginate.ts";
import { eventFormatFilters } from "./party-filter.ts";
import type { LedgerCallResult, LedgerPartyFilter, LedgerRequest, LedgerSend } from "./types.ts";

// The party scope is given only via eventFormat.filtersByParty, or — for a viewer reading as every party on
// the participant — via eventFormat.filtersForAnyParty. Which of the two is decided by LedgerPartyFilter and
// nowhere else; see party-filter.ts. No other global filter keys are placed in the body.
//
// **The filter and `verbose` sit under `eventFormat`, not at the top of the body.** Canton 3.3 moved them
// there; 3.4 and 3.5 still took the old place, 3.6 refuses it (`DEPRECATED_API_DISABLED`, off by default)
// and 3.7 removes it. The product sent the old place until 2026-10-21, when a participant upgraded to 3.6.3
// turned every active-contracts read into a 502. The node's own document says the old spelling is converted
// into this one, and on 3.4.8 the two were answered byte for byte the same — so this spelling is right for
// every version the product has met.
//
// **The snapshot is asked for in parts.** `limit` caps one response at LEDGER_PAGE_SIZE elements, and
// `streamContinuationToken` says where the next part starts. Without it the node answers
// `413 JSON_API_MAXIMUM_LIST_ELEMENTS_NUMBER_REACHED` as soon as the participant holds more active contracts
// than its list limit. The node's own document states what a continuation is only good for: the same
// participant, the same Canton version, the same activeAtOffset, and no pruning after that offset. All four
// hold inside one callGetActiveContracts — the offset is fixed for the whole walk and the walk is one
// sequence of calls to one participant.
export function buildGetActiveContractsRequest(
  filter: LedgerPartyFilter,
  offset: number,
  interfaceId?: string,
  streamContinuationToken?: string,
): LedgerRequest {
  const cumulativeEntry: unknown =
    interfaceId === undefined
      ? { identifierFilter: { WildcardFilter: { value: { includeCreatedEventBlob: false } } } }
      : {
          identifierFilter: {
            InterfaceFilter: {
              value: { interfaceId, includeInterfaceView: true, includeCreatedEventBlob: false },
            },
          },
        };

  return {
    method: "POST",
    path: withPageLimit("/v2/state/active-contracts", LEDGER_PAGE_SIZE),
    body: {
      eventFormat: { ...eventFormatFilters(filter, cumulativeEntry), verbose: true },
      activeAtOffset: offset,
      ...(streamContinuationToken === undefined ? {} : { streamContinuationToken }),
    },
  };
}

// Canton 3.5 puts a streamContinuationToken on every element of the response; the one on the last element of
// a page is the position the next page resumes from.
function readContinuationToken(lastElement: unknown): LedgerPageCursor | undefined {
  if (typeof lastElement !== "object" || lastElement === null) return undefined;
  const token = (lastElement as { streamContinuationToken?: unknown }).streamContinuationToken;
  return typeof token === "string" && token.length > 0 ? token : undefined;
}

// Walks the whole snapshot and hands back one complete array, so callers see what they saw before —
// one result, not a page. What ends the walk and what bounds it is written once, in paginate.ts.
export async function callGetActiveContracts(
  send: LedgerSend,
  filter: LedgerPartyFilter,
  offset: number,
  interfaceId?: string,
): Promise<LedgerCallResult<unknown>> {
  return await collectLedgerPages(
    send,
    (cursor) =>
      buildGetActiveContractsRequest(
        filter,
        offset,
        interfaceId,
        cursor === undefined ? undefined : String(cursor),
      ),
    readContinuationToken,
  );
}
