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
    globals,
} from 'aws-core-vscode/shared'

const manifestURL = 'https://aws-toolkit-language-servers.amazonaws.com/codewhisperer/0/manifest.json'

export class AmazonQLSPDownloader extends LspDownloader {
    constructor(
        private readonly serverPath: string,
        private readonly clientPath: string
    ) {
        super(manifestURL, 'codewhisperer')
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

        const current = globals.globalState.tryGet('aws.toolkit.lsp.versions', Object, {})
        current[this.lsName] = server.serverVersion
        globals.globalState.tryUpdate('aws.toolkit.lsp.versions', current)

        let tempFolder = undefined

        try {
            tempFolder = await makeTemporaryToolkitFolder()

            // download and extract the business logic
            const downloadedServer = await this.downloadAndExtractServer({
                content: server,
                installLocation: this.serverPath,
                name: 'qdeveloperserver',
                tempFolder,
            })
            if (!downloadedServer) {
                getLogger('lsp').error(`Failed to download and extract server`)
                return false
            }

            // download and extract mynah ui
            const downloadedClient = await this.downloadAndExtractServer({
                content: clients,
                installLocation: this.clientPath,
                name: 'qdeveloperclient',
                tempFolder,
            })
            if (!downloadedClient) {
                getLogger('lsp').error(`Failed to download and extract client`)
                return false
            }
        } finally {
            if (tempFolder) {
                await tryRemoveFolder(tempFolder)
            }
        }

        return true
    }
}
