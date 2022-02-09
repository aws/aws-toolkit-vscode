/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ExtContext } from '../shared/extensions'
import { createSdkAccessWebview } from './sdkAccessBackend'
import { SdkDefs } from './sdkDefs'

export async function activate(ctx: ExtContext): Promise<void> {
    const sdkDefs = SdkDefs.getInstance(ctx)
    ctx.extensionContext.subscriptions.push(
        vscode.commands.registerCommand('aws.sdk.openSdk', async () => {
            if (await sdkDefs.isSdkDefsReady()) {
                createSdkAccessWebview(ctx)
            }
        })
    )
}
