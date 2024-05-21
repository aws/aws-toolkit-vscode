/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { activateCommon, deactivateCommon } from './extensionCommon'

export async function activate(context: vscode.ExtensionContext) {
    await activateCommon(context, false)
}

export async function deactivate() {
    await deactivateCommon()
}
