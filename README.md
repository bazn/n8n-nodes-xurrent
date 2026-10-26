<div align="center">

# Xurrent for n8n

**Automate Xurrent (formerly 4me) service management with n8n:** requests, problems, workflows, tasks and approvals, configuration items, people, notes and attachments, plus a real-time webhook trigger.

[![npm version](https://img.shields.io/npm/v/@bazulu1/n8n-nodes-xurrent.svg)](https://www.npmjs.com/package/@bazulu1/n8n-nodes-xurrent)
[![CI](https://github.com/bazn/n8n-nodes-xurrent/actions/workflows/ci.yml/badge.svg)](https://github.com/bazn/n8n-nodes-xurrent/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE.md)
[![n8n community node](https://img.shields.io/badge/n8n-community%20node-EA4B71.svg)](https://docs.n8n.io/integrations/community-nodes/)

</div>

---

## Highlights

- **Service desk end to end:** create, update and complete requests, problems and workflows, add (internal) notes and read them back.
- **Approvals:** approve or reject approval tasks, list approvals and add approvers.
- **Real-time trigger:** listens to every Xurrent webhook event (request created, status changed, note added, …). Webhooks are registered and removed automatically and the verification handshake is handled for you.
- **Everything else:** the *Record* resource reads and writes any API collection (teams, organizations, services, SLAs, time entries, …) and offers a custom API call.
- **Comfortable to use:** teams, people, services, service instances, templates and CIs are searchable lists loaded live from your account; records can also be picked by ID or by pasting their Xurrent URL.
- **AI-agent ready:** every operation can be used as a tool by n8n AI agents.

## Contents

- [Installation](#installation)
- [Credentials](#credentials)
- [Xurrent node](#xurrent-node)
- [Xurrent Trigger](#xurrent-trigger)
- [Good to know](#good-to-know)
- [Development](#development)
- [Changelog](CHANGELOG.md) · [License](#license) · [Disclaimer](#disclaimer)

## Installation

**Self-hosted n8n (also in Docker)**

1. Open **Settings → Community Nodes → Install**.
2. Enter `@bazulu1/n8n-nodes-xurrent`, confirm the notice and install.
3. Search for **Xurrent** in the node panel.

<details>
<summary>Install without the UI (e.g. for queue-mode workers)</summary>

```bash
docker exec -it <n8n-container> sh -c "mkdir -p ~/.n8n/nodes && cd ~/.n8n/nodes && npm install @bazulu1/n8n-nodes-xurrent"
docker restart <n8n-container>
```

</details>

## Credentials

Choose the method under **Authentication** on the node.

| Credential | Fields |
|---|---|
| **Xurrent API** *(personal access token)* | Environment, Account ID, personal access token (*My Profile → Personal Access Tokens*), optional language |
| **Xurrent OAuth (Client Credentials) API** | Environment, Account ID, client ID and secret of an OAuth application (*Settings → OAuth Applications*), optional token URL and language |

- **Environment** selects the API host: production, QA or demo, in the global, AU, CH, UK or US region, or a custom URL.
- **Account ID** is sent as `X-Xurrent-Account`; it is the first part of your Xurrent URL (`wdc` for `https://wdc.xurrent.com`). Use the **support domain** account that holds the requests: a *directory* account only serves people and organizations and answers everything else with "Not Found. Provide the x-xurrent-account header from one of the support domains".
- The token's **scopes** limit what the node may do; missing scopes answer with *401 Unauthorized* even if the user has the role. The credential test calls `GET /me`, so grant at least *me – All*. Workflows need the workflow scopes (incl. workflow templates and types), the trigger needs *webhooks* and the account administrator role.
- OAuth tokens are requested from `oauth.<region host>/token` and renewed automatically.

## Xurrent node

| Resource | Operations |
|---|---|
| **Request** | Create, Get, Get Many, Update, Add Note, Get Notes, Archive, Trash, Restore |
| **Problem** | Create, Get, Get Many, Update, Add Note, Get Notes, Archive, Trash, Restore |
| **Workflow** | Create, Get, Get Many, Update, Add Note, Get Notes, Get Tasks, Get Requests, Archive, Trash, Restore |
| **Task** | Create (in a workflow), Get, Get Many, Update, Add Note, Get Notes, Approve, Reject, Get Approvals, Add Approver |
| **Configuration Item** | Create, Get, Get Many, Update, Archive, Trash, Restore |
| **Person** | Create, Get, Get Many, Update, Get Me, Archive, Trash, Restore |
| **Record (Any Collection)** | Get, Get Many, Create, Update, Delete on any collection path, and **Custom API Call** |
| **Attachment** | Upload (returns the storage key), Download |

**Get Many** offers the predefined views of Xurrent (e.g. *Open*, *Assigned to My Team*, *Approval by Me*), typed filters (status, category, team, member, created/updated after/before, …), field selection, sorting and free query parameters for any [filter](https://developer.xurrent.com/v1/general/filtering/) the API supports. Pagination follows the cursor links of the API automatically.

**Custom fields** of UI extensions are set with *Custom Fields (JSON)*, either as `[{"id": "field", "value": "…"}]` or as `{"field": "…"}`. Any other API field can be sent with *Extra Fields (JSON)*.

**Attachments in notes:** upload the file with *Attachment → Upload*, then use *Add Note* with *Attachment Keys* = `{{ $json.key }}`.

## Xurrent Trigger

Select one or more **events**. On activation the trigger creates one Xurrent webhook per event pointing to the n8n webhook URL (with a random secret), and deletes them again on deactivation.

- The `webhook.verify` message Xurrent sends after registration is answered automatically, so the webhook becomes active without manual steps.
- **Fetch Record** (on by default) loads the full record of the event as `record`; **Fetch Note** loads the note of *note added* events as `note`.
- **Ignore Events by Person IDs** skips changes made by e.g. the integration user, to avoid loops.
- If the webhooks are linked to a **webhook policy**, messages arrive as JWT. Paste the policy's public key into **Webhook Policy Public Key** to accept only correctly signed messages (RS, PS and ES algorithms).

> The n8n instance must be reachable from Xurrent over HTTPS. Webhooks are account wide, so creating them needs the account administrator role.

## Good to know

- Text filters of the REST API are exact and case-sensitive (except `primary_email`, `label` and `serial_nr`). Use the searchable lists or the Search API for fuzzy lookups.
- Reference filters are sent as `<field>_id` (e.g. `team_id=12`), following the [filtering documentation](https://developer.xurrent.com/v1/general/filtering/).
- Timestamps with an offset are converted to UTC (`2026-01-05T23:00:00Z`); values without an offset are sent unchanged.
- Rate limit errors (HTTP 429) are reported with the API message; use n8n's *Retry On Fail* for automatic retries.

## Development

```bash
npm install
npm run dev     # n8n with the node in watch mode
npm run lint
npm test        # build + unit tests
npm run test:live   # end-to-end tests against a QA/demo account, configured in .env (see test/live/harness.cjs)
                    # set XURRENT_TEST_WEBHOOK_URL to a URL you own (e.g. an unused path on your n8n) to include the trigger
```

The implementation follows the official API reference at [developer.xurrent.com](https://developer.xurrent.com/v1/).

## License

[MIT](LICENSE.md)

## Disclaimer

This is an unofficial community node. It is not developed, endorsed, sponsored or supported by Xurrent, Inc. "Xurrent" and the Xurrent logo are trademarks of Xurrent, Inc. and are used here only to identify the service the node connects to.
