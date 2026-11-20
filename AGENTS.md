<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules
- All data access goes through src/lib/repository.ts; UI never touches storage directly (swap storage later without UI changes).
- All entity types live in src/lib/types.ts.
- Work order statuses are data (serviceStatuses) with a behavior kind; logic keys off kind, never label, so users can rename/add statuses.
- Global service form lives in AppShell and opens via src/lib/service-events.ts so Ctrl+N works on every page.
- Payments are records of off-app collections: always tied to a workOrderId in the order's currency; payment state is computed (orderBalance), never stored, and only status=active payments reduce debt.
- Payment UI (badge, balance table, add/cancel dialogs) lives in src/components/Payments.tsx so service, vehicle, customer and /odemeler views share one source.
- Date ranges and day/week/month/year buckets live in src/lib/periods.ts as local-time [from, to) ranges; all period math (periodSummary, serviceIndicators, report functions) lives in repository.ts so dashboard, income/expense and report pages compute identically.
- Reports take one ReportFilter: order filters (status, payment state, customer, plate, currency) apply to work orders and to payments via their order; expenses have no order link, so they follow only date and currency.
- Finance definitions shown on cards come from FINANCE_DEFINITIONS in src/components/FinanceSummary.tsx, the single source for labels and explanations.
- Backup/restore logic lives in src/lib/backup.ts and touches storage only via repository.ts raw-table helpers (readAllTables/replaceAllTables), so restores are all-or-nothing with rollback.
- Permanent delete is an extra option beside archive: cascade rules, preview counts, last-delete snapshot and undo live in repository.ts (delete*/previewDelete*/undoLastDelete); UI uses the shared src/components/DeleteButton.tsx two-step confirm.
