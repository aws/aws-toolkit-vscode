/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { activateShared } from './extensionShared'

export async function activate(context: vscode.ExtensionContext) {
    await activateShared()
}

export async function deactivate() {}
