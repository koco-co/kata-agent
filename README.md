# kata-agent

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
