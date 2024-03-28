/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ExtensionContext } from 'vscode'
import { awsToolkitActivate, awsToolkitDeactivate } from 'aws-core-vscode'
import { awsToolkitApi } from './api'
import { Commands } from 'aws-core-vscode/shared'

export async function activate(context: ExtensionContext) {
    await awsToolkitActivate(context)

    // after toolkit is activated, ask Amazon Q to register toolkit api callbacks
    await Commands.tryExecute('aws.amazonq.refreshConnectionCallback', awsToolkitApi)
    return awsToolkitApi
}

export async function deactivate() {
    await awsToolkitDeactivate()
}
