/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ExtensionContext } from 'vscode'
import { activate as activateWeb, deactivate as deactivateWeb } from 'aws-core-vscode/web'

export async function activate(context: ExtensionContext) {
    return activateWeb(context)
}

export async function deactivate() {
    await deactivateWeb()
}
