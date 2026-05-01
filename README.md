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
