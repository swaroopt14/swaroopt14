# Contributing Guide

Thank you for contributing to Arealis Zord.

This repository is private, proprietary, and confidential. Contributions are intended for authorized team members, approved contractors, and approved collaborators working with Arealis Network.

## Before You Contribute

Please read these files first:

- [README.md](./README.md)
- [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)
- [SECURITY.md](./SECURITY.md)
- [LICENSE](./LICENSE)

## Contribution Expectations

When contributing to this repository:

- protect private code, internal architecture, credentials, and customer-related information
- keep changes scoped to the task you are working on
- avoid unrelated refactors unless they are necessary
- write clear commit messages and pull request descriptions
- document important behavior changes
- raise security-sensitive concerns privately

## Do Not Share Confidential Material

Do not:

- copy code into public repositories
- share internal code or screenshots publicly without approval
- paste secrets, credentials, tokens, keys, or customer data into issues, PRs, or chat
- upload confidential code to unauthorized AI tools or third-party platforms

## Branch And Pull Request Workflow

Use the team workflow agreed by the maintainers. If no separate workflow has been given, use this default:

1. Create a branch from the current working branch.
2. Make focused changes.
3. Run relevant checks locally.
4. Open a pull request with a clear summary.
5. Wait for review before merging.

Recommended pull request content:

- what changed
- why the change was needed
- affected services or folders
- deployment or migration impact
- test notes

## Code Quality

Before opening a pull request:

- run relevant tests for the service you changed
- review the diff for accidental secrets or unrelated files
- keep formatting and style consistent with nearby code
- update documentation if behavior or setup changed

## Pre-Commit Checks

This repository includes a pre-commit configuration for secret scanning with `gitleaks`.

If you use pre-commit locally:

```bash
pre-commit install
pre-commit run --all-files
```

If `gitleaks` reports a secret or token, remove it before committing.

## Service-Level Development

Different services in this repository use different stacks.

Examples:

- Go services under `backend/`
- Next.js frontend in `backend/zord-console`
- Jenkins pipeline files under `jenkins/`
- Kubernetes manifests under `kubernetes/`

Run the checks that match the area you changed.

## Security Issues

Do not open a public issue for vulnerabilities, secrets, or exploit details.

Report them through the private process described in [SECURITY.md](./SECURITY.md).

## Conduct

All contributors are expected to follow the standards in [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).

## Legal And Ownership

By contributing to this repository, you acknowledge that:

- this project is proprietary and confidential
- contributions may be subject to employment, contractor, founder, NDA, or other written agreements
- code, documentation, and related work product contributed for this project may belong to Arealis Network under applicable agreements and law

If you are unsure whether you are authorized to contribute, check with the maintainers before submitting changes.
