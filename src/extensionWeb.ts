/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { setInBrowser } from './common/browserUtils'
import { browserActivate } from './extensionShared'

export async function activate(context: vscode.ExtensionContext) {
    setInBrowser(true) // THIS MUST ALWAYS BE FIRST

    void vscode.window.showInformationMessage(
        'AWS Toolkit: Browser Mode Under Development. No features are currently provided'
    )

    await browserActivate(context)
}

export async function deactivate() {}
