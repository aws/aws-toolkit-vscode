/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ManifestManager, LspManager, LspInstaller, LspResult } from 'aws-core-vscode/shared'

const manifestURL = 'https://aws-toolkit-language-servers.amazonaws.com/codewhisperer/0/manifest.json'

export class AmazonQLSPInstaller implements LspInstaller {
    async install(): Promise<LspResult> {
        const overrideLocation = process.env.AWS_LANGUAGE_SERVER_OVERRIDE
        if (overrideLocation) {
            void vscode.window.showInformationMessage(`Using language server override location: ${overrideLocation}`)
            return {
                assetDirectory: overrideLocation,
                location: 'override',
                version: '0.0.0',
            }
        }

        const manifestManager = new ManifestManager(manifestURL, 'amazonq')
        const manifest = await manifestManager.getManifest()

        const lspManager = new LspManager(manifest, '', '')
        const downloadResult = lspManager.download()

        // TODO Cleanup old versions of language servers
        return downloadResult
    }
}
