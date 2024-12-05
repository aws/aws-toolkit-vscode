/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    LspDownloader,
    getLogger,
    makeTemporaryToolkitFolder,
    tryRemoveFolder,
    fs,
    Manifest,
} from 'aws-core-vscode/shared'

const manifestURL = 'https://aws-toolkit-language-servers.amazonaws.com/codewhisperer/0/manifest.json'

export class AmazonQLSPDownloader extends LspDownloader {
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

            // download and extract the business logic
            await this.downloadAndExtractServer({
                content: server,
                installLocation: this.serverPath,
                name: 'qdeveloperserver',
                tempFolder,
            })

            // download and extract mynah ui
            await this.downloadAndExtractServer({
                content: clients,
                installLocation: this.clientPath,
                name: 'qdeveloperclient',
                tempFolder,
            })
        } finally {
            if (tempFolder) {
                await tryRemoveFolder(tempFolder)
            }
        }

        return true
    }
}
