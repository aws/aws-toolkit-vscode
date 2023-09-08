/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

// The following is required so that the copyFiles script does not fail.
// I'm assuming this generates something when run that the script can use.
import * as nls from 'vscode-nls'
nls.loadMessageBundle()

export async function activate(context: vscode.ExtensionContext) {
    vscode.window.showInformationMessage(
        'AWS Toolkit: Browser Mode Under Development. No features are currently provided',
        { modal: true }
    )
}

export async function deactivate() {}
