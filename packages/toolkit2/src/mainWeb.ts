/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ExtensionContext } from 'vscode'
import { awsToolkitWebActivate, awsToolkitWebDeactivate } from 'aws-core-vscode'

export async function activate(context: ExtensionContext) {
    return awsToolkitWebActivate(context)
}

export async function deactivate() {
    await awsToolkitWebDeactivate()
}
