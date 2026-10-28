# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[semantic versioning](https://semver.org/).

## 0.1.2

### Fixed

- Node parameter definitions now pass the n8n community package scanner without ESLint
  exceptions (operation default, view options and the custom fields description).

## 0.1.1

### Changed

- The node and credential icons now use the official Xurrent brand mark.
- README: added a disclaimer that this is an unofficial community node.

## 0.1.0

### Added

- **Xurrent** node with the resources Request, Problem, Workflow, Task, Configuration Item, Person,
  Record (any collection, plus a custom API call) and Attachment.
- Requests, problems and workflows: create, get, get many (with the predefined views of Xurrent and
  filters), update, add note, get notes, archive, trash and restore.
- Tasks: create inside a workflow, get, get many, update, notes, approve, reject, get approvals and
  add approvers.
- Attachments: upload a binary to the attachment storage (key for notes and attachment fields) and
  download attachments.
- Searchable lists for teams, people, services, service instances, templates, CIs, products,
  organizations, sites, requests, problems, workflows and tasks.
- **Xurrent Trigger** based on Xurrent webhooks: registers and removes the webhooks automatically,
  answers the `webhook.verify` handshake, protects the URL with a secret, optionally verifies JWT
  signatures of webhook policies and loads the full record and note of each event.
- Credentials for personal access tokens and OAuth client credentials, for every Xurrent
  environment and region.
- Writes to a workflow (and tasks added to it) are retried for a few seconds while Xurrent is still
  building a new workflow from its template, which answers 404 in the meantime.
- Approve and Reject fail with a clear message when Xurrent keeps the task status, instead of
  silently reporting success.
- Live end-to-end test suite (`npm run test:live`) against a QA or demo account.
