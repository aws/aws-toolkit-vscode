/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { activate as activateConnectionMagicsSelector } from './connectionMagicsSelector/activation'
import { activate as activateExplorer } from './explorer/activation'
import { isSageMaker } from '../shared/extensionUtilities'
import { initializeResourceMetadata } from './shared/utils/resourceMetadataUtils'
import { setContext } from '../shared/vscode/setContext'
import { SmusUtils } from './shared/smusUtils'
import * as smusUriHandlers from './uriHandlers'
import { ExtContext } from '../shared/extensions'

export async function activate(ctx: ExtContext): Promise<void> {
    // Only run when environment is a SageMaker Unified Studio space
    if (isSageMaker('SMUS') || isSageMaker('SMUS-SPACE-REMOTE-ACCESS')) {
        await initializeResourceMetadata()
        // Setting context before any getContext calls to avoid potential race conditions.
        await setContext('aws.smus.inSmusSpaceEnvironment', SmusUtils.isInSmusSpaceEnvironment())
        await activateConnectionMagicsSelector(ctx.extensionContext)
    }
    await activateExplorer(ctx.extensionContext)

    // Register SMUS URI handler for deeplink connections
    ctx.extensionContext.subscriptions.push(smusUriHandlers.register(ctx))
}
