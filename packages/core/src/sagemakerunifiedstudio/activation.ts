/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { activate as activateConnectionMagicsSelector } from './connectionMagicsSelector/activation'
import { activate as activateExplorer } from './explorer/activation'
import { isSageMaker } from '../shared/extensionUtilities'
import { initializeResourceMetadata } from './shared/utils/resourceMetadataUtils'

export async function activate(extensionContext: vscode.ExtensionContext): Promise<void> {
    // Only run when environment is a SageMaker Unified Studio space
    if (isSageMaker('SMUS') || isSageMaker('SMUS-SPACE-REMOTE-ACCESS')) {
        await initializeResourceMetadata()
        await activateConnectionMagicsSelector(extensionContext)
    }
    await activateExplorer(extensionContext)
}
