/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ExtensionContext } from 'vscode'
import { activateWebShared } from 'aws-core-vscode/webShared'
import { activateAmazonQCommon, deactivateCommon } from './extension'

export async function activate(context: ExtensionContext) {
    await activateWebShared(context)
    await activateAmazonQCommon(context, true)
}

export async function deactivate() {
    await deactivateCommon()
}
