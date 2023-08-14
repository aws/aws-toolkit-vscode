/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { setInBrowser } from './common/browserUtils'

export async function activate(context: vscode.ExtensionContext) {
    setInBrowser(true)

    vscode.window.showInformationMessage(
        'AWS Toolkit: Browser Mode Under Development. No features are currently provided',
        { modal: false }
    )
}

export async function deactivate() {}
