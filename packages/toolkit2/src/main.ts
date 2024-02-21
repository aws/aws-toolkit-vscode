/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ExtensionContext } from 'vscode'
import { awsToolkitActivate, awsToolkitDeactivate } from 'aws-core-vscode'

export async function activate(context: ExtensionContext) {
    return awsToolkitActivate(context)
}

export async function deactivate() {
    await awsToolkitDeactivate()
}
