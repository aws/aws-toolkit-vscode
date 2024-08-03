# Icons

All icons that are used in the extensions can be found in `resources/icons`.

A [build script](../scripts/generateIcons.ts) generates extension artifacts in [core/](../packages/core/):

-   `resources/icons/cloud9/generated`
-   `resources/fonts/aws-toolkit-icons.woff`
-   `resources/css/icons.css`
-   `contributes.icons` in [amazonq package.json](../packages/amazonq/package.json) and [toolkit package.json](../packages/toolkit/package.json)

This script should be ran using `npm run generateIcons` after making updates. Any changes made to `package.json` should be committed with the relevant icons. Type checking in `core/` relies on the entries in `core/package.json`. However, the individual extensions require entries in their `package.json`s as well. Currently, resources (including icons) are shared between `core/` and the individual extensions. If `contributes.icons` in each of the extensions does not match the entry in `core/`, then CI will fail.

To sync the icons to the individual extensions, run `npm run copyFiles && npm run generateIcons` for each extension.

## Fonts

Icons to be used in fonts should ideally be:

-   Monochromatic (`currentColor` fill or stroke)
-   Equal in size and width
-   Defined by a single path

The benefits of doing this include:

-   `ThemeIcon` support
-   Automatic generation of CSS classes for webviews
-   Static validation of icon identifiers

If your desired icon does not work well as a font, see [Theme Overrides](#theme-overrides) for adding icons as standalone images.

## Identifiers

Icons (except those in `cloud9`) can be referenced within the Toolkit by concatenating the icon path with hyphens, omitting the 'theme' if applicable.

Examples:

-   `resources/icons/aws/apprunner/service.svg` -> `aws-apprunner-service`
-   `resources/icons/vscode/dark/help.svg` -> `vscode-help`
-   `resources/icons/vscode/codicons/close.svg` -> `vscode-close`

This specific format is used to keep things consistent with CSS classes while still supporting some semblance of namespacing. In Webviews, font-based icons can be used through the combination two CSS classes: `icon icon-${IDENTIFIER}`.

## Theme Overrides

By default, icons are assumed to be monochromatic and suitable for use as a font. If this is not the case, then icons specific to each theme (i.e. `dark` and `light`) must be added separately.

For example, if I wanted to use a special App Runner service icon, then I need to add the icons like so:

-   `resources/icons/aws/dark/apprunner-service.svg`
-   `resources/icons/aws/light/apprunner-service.svg`

A similar format is used for overriding icons only on Cloud9:

-   `resources/icons/cloud9/dark/aws-apprunner-service.svg`
-   `resources/icons/cloud9/light/aws-apprunner-service.svg`

These icons will **not** be usuable as Codicons or as font icons.

## Third Party

Icons sourced from third-party repositories need a corresponding entry placed within this section. Any added icons need to be placed in their own directory named after the source. Repositories that belong to the same organization may be placed in the same location.

### VS Code

[Visual Studio Code Icons](https://github.com/microsoft/vscode-icons) were moved to their own repository in August 2019. These files are located within [resources/icons/vscode](resources/icons/vscode).

[Visual Studio Code Codicons](https://github.com/microsoft/vscode-codicons). Codicons are VS Code's font-based icon set. These files are located within [resources/icons/vscode/codicons](resources/icons/vscode/codicons).
