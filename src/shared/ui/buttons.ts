/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as path from 'path'
import { ExtensionContext, QuickInputButton, Uri } from 'vscode'

let resourcesAbsolutePath: string | undefined

/**
 * Loads the extension's absolute path so the help button can find its icon
 * @param path Extension's absolute path
 */
export function initializeButtons(context: ExtensionContext): void {
    resourcesAbsolutePath = context.asAbsolutePath('resources')
}

/**
 * Creates a QuickInputButton with a predefined help button (dark and light theme compatible)
 * Images are only loaded after extension.ts loads; this should happen on any user-facing extension usage.
 * button will exist regardless of image loading (UI tests will still see this)
 * @param tooltip Optional tooltip for button
 */
export function createHelpButton(tooltip?: string): QuickInputButton {
    const light = resourcesAbsolutePath ? path.join(resourcesAbsolutePath, 'light', 'help.svg') : ''
    const dark = resourcesAbsolutePath ? path.join(resourcesAbsolutePath, 'dark', 'help.svg') : ''

    return {
        iconPath: {
            light: Uri.file(light),
            dark: Uri.file(dark)
        },
        tooltip
    }
}
