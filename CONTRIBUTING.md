# Contributing

Thanks for your interest in Prompt Bank. Contributions of prompts, code, and documentation are welcome.

## Prompts

- One prompt per file under `prompts/<category>/`.
- Keep the `id` stable, unique, and kebab case, because links and habits depend on it.
- Keep prompts free of personal, employer, or proprietary content, real names, secrets, and machine specific paths. The example prompts are generic on purpose.
- Your own private prompts belong in your global `~/.prompt-bank/` or a folder's `.prompt-bank/` directory, not in this repository. A boundary guard fails the build if a `.prompt-bank` path is ever tracked.
- Every declared option must be used, and any prompt with options must include an `{{#allOptionsDisabled}}` fallback.
- Run `npm run validate` before you open a pull request.

See `docs/authoring.md` for a walkthrough and `schema.md` for the full contract.

## Application

- Follow the existing patterns and the Fluent based design. Do not add new UI primitives, colors, or icons without a clear reason.
- Run `npm run check`, which validates, tests, and builds. For interface changes, also run `npm run e2e`.
- Keep the interface keyboard reachable and accessible.

## The boundary

Prompt Bank is copy only. Please do not add prompt execution, model or API calls, a backend, accounts, or telemetry. Keep it local and file based. This boundary is the point of the project.

## Pull requests

- Keep changes focused and describe what you changed and why.
- Include the output of the relevant checks as proof.
- For interface changes, include a screenshot.

## License

By contributing, you agree that your contributions are licensed under the MIT License of this repository.
