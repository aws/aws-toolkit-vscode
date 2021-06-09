/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { ext } from '../extensionGlobals'
import { WizardControl, WIZARD_BACK } from '../wizards/wizard'

const localize = nls.loadMessageBundle()
const HELP_TOOLTIP = localize('AWS.command.help', 'View Toolkit Documentation')

export class QuickInputButton<T> implements vscode.QuickInputButton {
    private readonly clickEmitter = new vscode.EventEmitter<T>()
    public readonly onClick = this.clickEmitter.event
    
    constructor(private readonly button: vscode.QuickInputButton, private readonly clickCallback: () => T) {}

    public get iconPath() { return this.button.iconPath }
    public get tooltip() { return this.button.tooltip }
    
    public activate(): void {
        const ret = this.clickCallback()
        if (ret !== undefined) {
            this.clickEmitter.fire(ret)
        }
    }
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
    return new QuickInputButton<void>({
        iconPath: {
            light: vscode.Uri.file(ext.iconPaths.light.help),
            dark: vscode.Uri.file(ext.iconPaths.dark.help),
        },
        tooltip,
    }, 
    () => vscode.env.openExternal(typeof uri === 'string' ? vscode.Uri.parse(uri) : uri))
}

// Currently VS Code uses a static back button for every QuickInput, so we can't redefine any of its
// properties without potentially affecting other extensions. Creating a wrapper is possible, but it
// would still need to be swapped out for the real Back button when adding it to the QuickInput.
export function createBackButton(): QuickInputButton<WizardControl> {
    return vscode.QuickInputButtons.Back as QuickInputButton<WizardControl>
}
