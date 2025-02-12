/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../logger/logger'
import { ToolkitError } from '../errors'
import { Timeout } from '../utilities/timeoutUtils'
import globals from '../extensionGlobals'
import { Manifest } from './types'
import { StageResolver, tryStageResolvers } from './utils/setupStage'
import { HttpResourceFetcher } from '../resourcefetcher/httpResourceFetcher'

const logger = getLogger('lsp')

interface StorageManifest {
    etag: string
    content: string
}

type ManifestStorage = Record<string, StorageManifest>

export const manifestStorageKey = 'aws.toolkit.lsp.manifest'
const manifestTimeoutMs = 15000

export class ManifestResolver {
    constructor(
        private readonly manifestURL: string,
        private readonly lsName: string
    ) {}

    /**
     * Fetches the latest manifest, falling back to local cache on failure
     */
    async resolve(): Promise<Manifest> {
        const resolvers: StageResolver<Manifest>[] = [
            {
                resolve: async () => await this.fetchRemoteManifest(),
                telemetryMetadata: { id: this.lsName, manifestLocation: 'remote' },
            },
            {
                resolve: async () => await this.getLocalManifest(),
                telemetryMetadata: { id: this.lsName, manifestLocation: 'cache' },
            },
        ]

        return await tryStageResolvers('getManifest', resolvers, extractMetadata)

        function extractMetadata(r: Manifest) {
            return {
                manifestSchemaVersion: r.manifestSchemaVersion,
            }
        }
    }

    private async fetchRemoteManifest(): Promise<Manifest> {
        const resp = await new HttpResourceFetcher(this.manifestURL, {
            showUrl: true,
            timeout: new Timeout(manifestTimeoutMs),
        }).getNewETagContent(this.getEtag())

        if (!resp.content) {
            throw new ToolkitError(
                `New content was not downloaded; fallback to the locally stored ${this.lsName} manifest`
            )
        }

        const manifest = this.parseManifest(resp.content)
        await this.saveManifest(resp.eTag, resp.content)
        this.checkDeprecation(manifest)
        manifest.location = 'remote'
        return manifest
    }

    private async getLocalManifest(): Promise<Manifest> {
        logger.info(`Failed to download latest ${this.lsName} manifest. Falling back to local manifest.`)
        const storage = this.getStorage()
        const manifestData = storage[this.lsName]

        if (!manifestData?.content) {
            throw new ToolkitError(`Failed to download ${this.lsName} manifest and no local manifest found.`)
        }

        const manifest = this.parseManifest(manifestData.content)
        this.checkDeprecation(manifest)
        manifest.location = 'cache'
        return manifest
    }

    private parseManifest(content: string): Manifest {
        try {
            return JSON.parse(content) as Manifest
        } catch (error) {
            throw new ToolkitError(
                `Failed to parse ${this.lsName} manifest: ${error instanceof Error ? error.message : 'Unknown error'}`
            )
        }
    }

    private checkDeprecation(manifest: Manifest): void {
        if (manifest.isManifestDeprecated) {
            const deprecationMessage = `${this.lsName} manifest is deprecated. No future updates will be available.`
            logger.info(deprecationMessage)
            void vscode.window.showInformationMessage(deprecationMessage)
        }
    }

    private async saveManifest(etag: string, content: string): Promise<void> {
        const storage = this.getStorage()

        globals.globalState.tryUpdate(manifestStorageKey, {
            ...storage,
            [this.lsName]: {
                etag,
                content,
            },
        })
    }

    private getEtag(): string | undefined {
        return this.getStorage()[this.lsName]?.etag
    }

    private getStorage(): ManifestStorage {
        return globals.globalState.tryGet(manifestStorageKey, Object, {})
    }
}
