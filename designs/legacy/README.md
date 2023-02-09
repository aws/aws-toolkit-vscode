# Legacy Designs

Designs related to the AWS Toolkit that are no longer relevant are considered "legacy". While the technical specifications may be outdated, these documents contain a lot of historical context that is often still relevant today.

Legacy documents are preserved in this directory. Use them to help inform any future design work. Relevant context about the legacy design should be added to this file, if applicable.

---

## [Feature Toggle](./feature-toggle.md)

Many of the technical concerns were made redundant when the `Settings` class was introduced in [#2576](https://github.com/aws/aws-toolkit-vscode/pull/2576). Two classes, `DevSettings` and `Experiments`, cover most of the requirements outlined in the design.
