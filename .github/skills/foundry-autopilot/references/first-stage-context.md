# First-stage context discovery

Run from the repository containing the standard authentication helper:

```powershell
python .github\skills\foundry-autopilot\scripts\prepare_first_stage.py --env .env
python .github\skills\foundry-autopilot\scripts\prepare_first_stage.py --env .env --execute
```

The first command reads metadata and prints a JSON plan. The second persists verified,
non-secret context to the specified file. It preserves existing nonempty settings,
comments and unrelated secrets. Explicit file settings take precedence over inherited
shell settings. No unrelated `.env` is loaded by the authentication helper.

## Discovery and selection

- Graph `/me` identifies the deploying owner; `/organization` supplies the tenant and
  verified internal domains. A pinned domain list may be a verified subset.
- ARM lists subscriptions, Foundry accounts/projects, registries and model deployments.
  Only subscriptions in the authenticated tenant are eligible. A pinned project endpoint
  can disambiguate Foundry accounts. The hosted account/project is never moved.
- Power Apps environment metadata supplies `ENV_ID` and `DATAVERSE_URL`. Dataverse
  solution/publisher metadata supplies the solution unique name and publisher prefix/name.
  The default solution is not selected implicitly.
- Existing successful chat deployments are reused, including deployments outside Japan.
  Model capabilities are verified using the existing account's model catalogue.
- Downstream aliases `AZURE_AI_ACCOUNT` / `AZURE_AI_PROJECT` and `ACR_LOGIN_SERVER`
  are persisted too. An absent `EVALUATION_JUDGE_DEPLOYMENT` reuses the verified chat
  deployment; an existing judge is verified on the selected model endpoint.
- `FOUNDRY_TOOLBOX_ENDPOINT` is persisted only when a toolbox endpoint is actually returned
  in project/account endpoint metadata. An undiscoverable pinned toolbox stops; an absent
  toolbox is reported as an explicit web/code readiness gap, never invented.
- Missing or ambiguous prerequisites stop with exit code 2 and concrete candidates.
  Set the corresponding `.env` values and rerun. Accounts, projects, registries,
  environments, solutions and publishers are **not** created.

Authentication uses only standard `auth_helper.get_token` / `get_session`. The initial
Graph token request calls `get_token(..., allow_interactive=True)`: the cache is tried
first, and only a missing/insufficient cached sign-in may open the standard browser.
The helper enforces CI restrictions and existing browser/account/tenant preferences;
there is no independent credential, login, PAC-profile creation, or device-code path.
The verified Graph identity is persisted as `PP_AUTH_ACCOUNT` only with `--execute`.
Execution also authorizes saving `PP_AUTH_ALLOW_INTERACTIVE=true` when not in CI and
an existing valid `PP_AUTH_EDGE_PROFILE` preference is available. That exact profile
preference is preserved/persisted too; no profile is guessed. Dry-run never stores consent.
Without a profile preference, initial task-authorized bootstrap still uses the helper,
but continuing consent is not stored and the plan reports that limitation.
Tokens for different APIs must identify the same tenant and delegated account.
Tokens, HTTP error bodies and SDK exception contents are not logged or persisted.

## No existing chat deployment

The plan has `status: "model-selection-required"` and includes `model_candidates`;
the command exits 2 without writing even when `--execute` was supplied.

Candidates come from the live ARM location-model catalogue in Japan East and Japan West.
Chat/inference capabilities, lifecycle/deprecation, model SKU and capacity metadata are
checked. `latest` marks the newest offered version per model/SKU/location using publisher
creation metadata and exact-version ordering; it is not a hard-coded model recommendation.
Older deployable versions remain visible for explicit selection.

Copy the exact values from the plan:

```powershell
python .github\skills\foundry-autopilot\scripts\prepare_first_stage.py `
  --env .env --model "<candidate name>" --model-version "<candidate version>" `
  --model-sku "<candidate SKU>"

# This explicitly authorizes a potentially chargeable model deployment.
python .github\skills\foundry-autopilot\scripts\prepare_first_stage.py `
  --env .env --model "<candidate name>" --model-version "<candidate version>" `
  --model-sku "<candidate SKU>" --execute
```

`--model-location REGION` overrides the new-model region policy only. Otherwise Japan East,
then Japan West, is preferred. A matching **existing** OpenAI-capable account is required;
pin `AZURE_OPENAI_ENDPOINT` or `AZURE_OPENAI_ACCOUNT` if several accounts qualify.
The deployment name is `AZURE_OPENAI_DEPLOYMENT` if pinned, otherwise the selected model name.
An existing deployment is never replaced implicitly. The script rechecks absence before
PUT and verifies the exact model/version/SKU after provisioning before persisting context.

## API grounding and boundaries

The model catalogue uses the documented `2024-10-01` `Models_List` operation:

`GET /subscriptions/{subscriptionId}/providers/Microsoft.CognitiveServices/locations/{location}/models`

Its response has `value[].model` (`AccountModel`), including `name`, `version`, `format`,
`capabilities`, `deprecation`, `lifecycleStatus`, `systemData`, and `skus[].capacity`.
The outer `skuName` is the account SKU, **not** a deployment SKU.

Source: [Microsoft Learn: Models - List](https://learn.microsoft.com/en-us/rest/api/aiservices/accountmanagement/models/list?view=rest-aiservices-accountmanagement-2024-10-01).
Foundry project discovery uses `2026-05-01`, matching `discover_foundry_context.py`.
Exact model/version deployment and SKU verification follow the existing
`provision_image_model.py` pattern without invoking Azure CLI authentication.

This is minimal context discovery, not a governance or readiness audit. Catalogue offers
do not guarantee current quota/capacity or authorization to deploy. Hosted-agent regional
eligibility, Frontier enrollment, RBAC assignments, licensing, publishing, Teams hire and
end-to-end chat verification remain separate first-stage orchestration prerequisites.
An API denial stops; it does not trigger governance diagnostics or alternative hosting.
Existing shared evaluationHub Code Apps discovery is not covered by these metadata APIs.
The plan reports a **blocking prerequisite before Hub deployment**: orchestration must
reuse the verified shared Hub app configuration (`power.config.json`), or explicitly
verify that no shared Hub exists before initializing one. This script does not initialize
a Hub or claim that a new teammate needs a separate Hub.

## Offline validation

```powershell
python -m unittest discover -s .github\skills\foundry-autopilot\scripts\tests `
  -p test_prepare_first_stage.py
```

Tests use fake delegated tokens and mocked metadata/ARM sessions only. Test files live in
an isolated project-local directory that is removed at teardown; no tenant calls or real
deployments are made.
