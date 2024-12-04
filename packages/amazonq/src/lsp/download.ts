/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    LSPDownloader,
    Manifest,
    getLogger,
    makeTemporaryToolkitFolder,
    tryRemoveFolder,
    fs,
} from 'aws-core-vscode/shared'

const manifestURL = 'https://aws-toolkit-language-servers.amazonaws.com/codewhisperer/0/manifest.json'

export class AmazonQLSPDownloader extends LSPDownloader {
    constructor(
        private readonly serverPath: string,
        private readonly clientPath: string
    ) {
        super(manifestURL)
    }

    async isLspInstalled(): Promise<boolean> {
        return (await fs.exists(this.serverPath)) && (await fs.exists(this.clientPath))
    }

    async cleanup(): Promise<boolean> {
        if (await fs.exists(this.serverPath)) {
            await tryRemoveFolder(this.serverPath)
        }

        if (await fs.exists(this.clientPath)) {
            await tryRemoveFolder(this.clientPath)
        }

        return true
    }

    async install(manifest: Manifest) {
        const server = this.getDependency(manifest, 'servers')
        const clients = this.getDependency(manifest, 'clients')
        if (!server || !clients) {
            getLogger('lsp').info(`Did not find LSP URL for ${process.platform} ${process.arch}`)
            return false
        }

        let tempFolder = undefined

        try {
            tempFolder = await makeTemporaryToolkitFolder()
            await this.downloadAndExtractServer(server, this.serverPath, 'qdeveloperserver', tempFolder)
            await this.downloadAndExtractServer(clients, this.clientPath, 'qdeveloperclient', tempFolder)
        } finally {
            // clean up temp folder
            if (tempFolder) {
                await tryRemoveFolder(tempFolder)
            }
        }

        return true
    }
}
