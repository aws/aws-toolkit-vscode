/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { activateShared, deactivateShared } from './extensionShared'
import { amazonQApi } from './api'

export async function activate(context: vscode.ExtensionContext) {
    await activateShared(context)
    return amazonQApi
}

export async function deactivate() {
    await deactivateShared()
}
