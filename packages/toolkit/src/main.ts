/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ExtensionContext } from 'vscode'
import { activate as activateCore, deactivate as deactivateCore } from 'aws-core-vscode'
import { awsToolkitApi } from './api'

export async function activate(context: ExtensionContext) {
    await activateCore(context)
    return awsToolkitApi
}

export async function deactivate() {
    await deactivateCore()
}
