/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import { ExtensionContext, QuickInputButton, Uri } from 'vscode'

/**
 * Creates a QuickInputButton with a predefined help button (dark and light theme compatible)
 * Images are only loaded after extension.ts loads; this should happen on any user-facing extension usage.
 * button will exist regardless of image loading (UI tests will still see this)
 * @param tooltip Optional tooltip for button
 */
export function createHelpButton(
    context: Pick<ExtensionContext, 'asAbsolutePath'>,
    tooltip?: string
): QuickInputButton {
    const light = path.join(context.asAbsolutePath('resources'), 'light', 'help.svg')
    const dark = path.join(context.asAbsolutePath('resources'), 'dark', 'help.svg')

    return {
        iconPath: {
            light: Uri.file(light),
            dark: Uri.file(dark)
        },
        tooltip
    }
}
