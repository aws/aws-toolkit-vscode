# Changelog
All notable changes to this extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.6.0] - 2022-09-019
### Changed
- Implicit search enables the ability to troubleshoot code and get suggestions on the fly.
- Autocomplete for mynah's search input field.
- Hotkey refactoring, `cmd+m` for all the mynah searches. 
- UI/UX updated to match with VS code styling.

## [0.5.2] - 2022-09-01
### Changed
- Fix of notification views counting

## [0.5.1] - 2022-08-31
### Changed
- UI/UX updates for a better experience and more space to view suggestions.

## [0.5.0] - 2022-08-30
### Changed
- API help allows you to search for usage examples for your dependencies' APIs.

## [0.4.0] - 2022-06-30
### Changed
- Feedback form and relevance votes are always visible.
- New search results open in the same column/group as the previously active results.
- Use static code analysis to find relevant imports from the context

## [0.3.0] - 2022-05-18
### Changed
- Search history is available now. Revisit previous queries and results
- New notifications UI
- Hide context keys and have more space to see search results

## [0.2.1] - 2022-03-28

### Fixed
- Fix context key insertion UI
- Fix 'click' and 'open' telemetry events

## [0.2.0] - 2022-03-21
### Changed
- Update readme with wiki link
- Update user interface with new style, new feedback form and new context insertion structure
- Update trigger context filters
- Trim and validate search query and keywords

### Fixed
- Fix issues where empty and duplicated context keys are allowed
 
## [0.1.0] - 2021-11-30
- Initial release of the extension with four triggers (SearchBar/TerminalLink/DebugError/DiagnosticError), three supporting languages (Python/JavaScript/TypeScript) and search results in Mynah suggestion pane.
