/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { activateShared, deactivateShared } from './extensionShared'

export async function activate(context: vscode.ExtensionContext) {
    await activateShared(context)
}

export async function deactivate() {
    await deactivateShared()
}
