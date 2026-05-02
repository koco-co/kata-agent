# kata-agent

kata-agent 是面向测试领域的 Agentic QA Workflow Engine。

当前项目按 Superpowers 工作流管理设计与实施：

- [Architecture Design](docs/superpowers/specs/2026-05-01-kata-agent-architecture-design.md)
- [Foundation Implementation Plan](docs/superpowers/plans/2026-05-01-kata-agent-v0.1-foundation.md)

## v0.1c Real Demo

Real mode calls a Lanhu source URL and an OpenAI-compatible provider. Configure
these environment variables before running the demo:

- `KATA_AGENT_PROVIDER_BASE_URL`
- `KATA_AGENT_PROVIDER_API_KEY`
- `KATA_AGENT_PROVIDER_MODEL`
- `LANHU_COOKIE`, only when the Lanhu URL requires authentication

Run the real demo from the repository root:

```sh
bun apps/cli/src/index.ts test-case-gen --mode real --project <project> --feature <feature> --source-url <lanhu-url> --root .
```

## v0.2 Web Automation

`ui-script-gen` consumes an existing `test-spec/test-spec.json` artifact and produces web-only automation artifacts:

- `automation/flow-spec.json`
- `automation/playwright/run-plan.json`
- `automation/playwright/generated.spec.ts`
- `automation/run-record.json`
- `automation/evidence-pack.json`
- `reports/automation-report.md`

Run the mocked automation foundation from the repository root:

```sh
bun apps/cli/src/index.ts ui-script-gen --project <project> --feature <feature> --test-spec test-spec/test-spec.json --root .
```

v0.2 does not run mobile or desktop automation.

## v0.4 External Collaboration Plugins

External collaboration side effects are explicit and schema-backed.

### DingTalk notification

`test-case-gen` can send the rendered confirmation draft to DingTalk before it waits for manual confirmation import.

Environment variables for real DingTalk delivery:

- `DINGTALK_WEBHOOK_URL`
- `DINGTALK_SECRET` when the robot uses signed webhooks

Run with real delivery:

```sh
bun apps/cli/src/index.ts test-case-gen --mode real --notify real --project <project> --feature <feature> --source-url <lanhu-url> --root .
```

DingTalk does not approve requirements. Import the canonical confirmation JSON with:

```sh
bun apps/cli/src/index.ts confirmation import --feature-dir <feature-dir> --run <run-id> --file confirmation-result.json --project <project> --feature <feature>
```

### Zentao issue sync

Create explicit issue drafts from a bug report:

```sh
bun apps/cli/src/index.ts issue draft --feature-dir <feature-dir> --bug-report reports/bug-report.json
```

After reviewing and setting `confirmedForSync` to `true`, sync one draft:

```sh
bun apps/cli/src/index.ts issue sync --mode real --feature-dir <feature-dir> --issue-draft reports/issues/<bug-id>.issue-draft.json
```

Environment variables for real Zentao sync:

- `ZENTAO_BASE_URL`
- `ZENTAO_TOKEN`

### Lanhu write-back

Create a write-back draft from a confirmed requirement spec:

```sh
bun apps/cli/src/index.ts lanhu writeback-draft --feature-dir <feature-dir> --requirement-spec requirement/spec/requirement-spec.json --target-url <lanhu-url>
```

After manual review, set `confirmedForWriteback` to `true` and provide `confirmedBy` / `confirmedAt`. Then run:

```sh
bun apps/cli/src/index.ts lanhu writeback --mode real --feature-dir <feature-dir> --draft reports/lanhu-writeback-draft.json
```

Validate the same draft without writing by passing the CLI flag:

```sh
bun apps/cli/src/index.ts lanhu writeback --mode real --dry-run --feature-dir <feature-dir> --draft reports/lanhu-writeback-draft.json
```

Environment variable for real Lanhu write-back:

- `LANHU_WRITEBACK_COOKIE`
- `LANHU_WRITEBACK_ALLOWED_HOSTS`, comma-separated hostnames such as `lanhu.example,lanhuapp.com`
