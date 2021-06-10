/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { ext } from '../extensionGlobals'
import { WizardControl } from '../wizards/wizard'

const localize = nls.loadMessageBundle()
const HELP_TOOLTIP = localize('AWS.command.help', 'View Toolkit Documentation')

/** Light wrapper around VS Code's buttons, adding a `onClick` callback. */
export interface QuickInputButton<T> extends vscode.QuickInputButton {
    onClick: (resolve: (arg: T) => void) => void
}

/**
 * Creates a QuickInputButton with a predefined help button (dark and light theme compatible)
 * Images are only loaded after extension.ts loads; this should happen on any user-facing extension usage.
 * button will exist regardless of image loading (UI tests will still see this)
 * 
 * @param uri Opens the URI upon clicking
 * @param tooltip Optional tooltip for button
 */
export function createHelpButton(uri: string | vscode.Uri, tooltip: string = HELP_TOOLTIP): QuickInputButton<void> {
    const button: vscode.QuickInputButton = {
        iconPath: {
            light: vscode.Uri.file(ext.iconPaths.light.help),
            dark: vscode.Uri.file(ext.iconPaths.dark.help),
        },
        tooltip,
    }
    const openUri = () => vscode.env.openExternal(typeof uri === 'string' ? vscode.Uri.parse(uri) : uri)

    return { ...button, onClick: openUri }
}

// Currently VS Code uses a static back button for every QuickInput, so we can't redefine any of its
// properties without potentially affecting other extensions. Creating a wrapper is possible, but it
// would still need to be swapped out for the real Back button when adding it to the QuickInput.
export function createBackButton(): QuickInputButton<WizardControl> {
    return vscode.QuickInputButtons.Back as QuickInputButton<WizardControl>
}
