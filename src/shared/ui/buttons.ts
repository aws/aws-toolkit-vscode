/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { QuickInputButton, Uri } from 'vscode'
import { ext } from '../extensionGlobals'

/**
 * Creates a QuickInputButton with a predefined help button (dark and light theme compatible)
 * Images are only loaded after extension.ts loads; this should happen on any user-facing extension usage.
 * button will exist regardless of image loading (UI tests will still see this)
 * @param tooltip Optional tooltip for button
 * @param url Optional URL to open when button is clicked
 */
export function createHelpButton(tooltip?: string, url?: string): HelpButton {
    return new HelpButton(tooltip, url)
}

export class HelpButton implements QuickInputButton {
    readonly iconPath = {
        light: Uri.file(ext.iconPaths.light.help),
        dark: Uri.file(ext.iconPaths.dark.help),
    }

    public constructor(readonly tooltip?: string, readonly url?: string) {}
}
