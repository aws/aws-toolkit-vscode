/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import crossFetch from 'cross-fetch'
import { getLogger } from '../logger/logger'
import { ToolkitError } from '../errors'
import { Manifest } from './types'
import { StageResolver, tryStageResolvers } from './utils/setupStage'
import { fs } from '../fs/fs'
import * as path from 'path'
import * as crypto from 'crypto'
import * as localizedText from '../localizedText'
import { AmazonQPromptSettings, amazonQPrompts } from '../settings'
import { Timeout } from '../utilities/timeoutUtils'
import { oneMinute } from '../datetime'

const logger = getLogger('lsp')

const maxRetries = 3
const baseDelayMs = 500

const manifestRequestTimeout = oneMinute

export interface ManifestResolverConfig {
    manifestUrl: string
    lsName: string
    cacheDir: string
    adapter?: ManifestAdapter
    suppressPrefix?: string
    fetchFn?: typeof fetch
    sleepFn?: (ms: number) => Promise<void>
}

export interface ManifestAdapter {
    adapt(raw: unknown): Manifest
}

export class ManifestResolver {
    private readonly manifestUrl: string
    private readonly lsName: string
    private readonly cacheDir: string
    private readonly manifestPath: string
    private readonly adapter?: ManifestAdapter
    private readonly suppressPrefix?: string
    private readonly fetchFn: typeof fetch
    private readonly sleepFn: (ms: number) => Promise<void>

    constructor(config: ManifestResolverConfig) {
        this.manifestUrl = config.manifestUrl
        this.lsName = config.lsName
        this.cacheDir = config.cacheDir
        this.adapter = config.adapter
        this.suppressPrefix = config.suppressPrefix
        // cross-fetch uses Node's http stack, which VS Code proxies; undici `fetch` is only proxied on newer VS Code.
        this.fetchFn = config.fetchFn ?? crossFetch
        this.sleepFn = config.sleepFn ?? defaultSleep
        this.manifestPath = path.join(this.cacheDir, 'manifest.json')
    }

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

        const manifest = await tryStageResolvers('getManifest', resolvers, extractMetadata)
        await this.checkDeprecation(manifest)
        return manifest

        function extractMetadata(r: Manifest) {
            return {
                manifestSchemaVersion: r.manifestSchemaVersion,
            }
        }
    }

    private async checkDeprecation(manifest: Manifest): Promise<void> {
        if (!this.suppressPrefix) {
            if (manifest.isManifestDeprecated) {
                logger.warn(`"${this.lsName}" manifest is deprecated`)
            }
            return
        }

        const lspId = `${this.suppressPrefix}LspManifestMessage` as keyof typeof amazonQPrompts
        if (!(lspId in amazonQPrompts)) {
            logger.error(`Prompt key "${lspId}" not found in amazonQPrompts, skipping deprecation toast`)
            return
        }

        const prompts = AmazonQPromptSettings.instance
        if (!manifest.isManifestDeprecated) {
            await prompts.enablePrompt(lspId)
            return
        }

        const deprecationMessage = `"${this.lsName}" manifest is deprecated. No future updates will be available.`
        logger.info(deprecationMessage)

        if (prompts.isPromptEnabled(lspId)) {
            void vscode.window
                .showInformationMessage(deprecationMessage, localizedText.ok, localizedText.dontShow)
                .then(async (button) => {
                    if (button === localizedText.dontShow) {
                        await prompts.disablePrompt(lspId)
                    }
                })
        }
    }

    private async fetchRemoteManifest(): Promise<Manifest> {
        const content = await this.fetchManifestContentWithRetries()

        const manifest = this.parseAndAdapt(content)
        await this.saveManifestAtomic(content)
        manifest.location = 'remote'
        return manifest
    }

    private async fetchManifestContentWithRetries(): Promise<string> {
        let lastError: Error | undefined

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const content = await this.fetchManifestOnce()
                logger.debug(`Fetched "${this.lsName}" manifest (attempt ${attempt}): ${this.manifestUrl}`)
                return content
            } catch (err) {
                lastError = err instanceof Error ? err : new Error(String(err))
                logger.warn(
                    `Manifest fetch attempt ${attempt}/${maxRetries} failed for "${this.lsName}": ${lastError.message}`
                )

                if (attempt < maxRetries) {
                    const delay = baseDelayMs * Math.pow(2, attempt - 1)
                    await this.sleepFn(delay)
                }
            }
        }

        throw new ToolkitError(
            `Failed to fetch "${this.lsName}" manifest after ${maxRetries} attempts: ${lastError?.message}`,
            { cause: lastError }
        )
    }

    private async fetchManifestOnce(): Promise<string> {
        const timeout = new Timeout(manifestRequestTimeout)
        const abortController = new AbortController()
        const disposable = timeout.token.onCancellationRequested(() => abortController.abort())
        try {
            const response = await this.fetchFn(this.manifestUrl, { signal: abortController.signal })
            if (response.status !== 200) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`)
            }
            return await response.text()
        } finally {
            disposable.dispose()
            timeout.dispose()
        }
    }

    private async getLocalManifest(): Promise<Manifest> {
        logger.info(`Trying cached "${this.lsName}" manifest at: ${this.manifestPath}`)

        if (!(await fs.existsFile(this.manifestPath))) {
            const msg = `Cached "${this.lsName}" manifest not found at: ${this.manifestPath}`
            logger.warn(msg)
            throw new ToolkitError(msg)
        }

        const content = (await fs.readFileText(this.manifestPath)).trim()
        if (!content) {
            const msg = `Cached "${this.lsName}" manifest is empty`
            logger.warn(msg)
            throw new ToolkitError(msg)
        }

        const manifest = this.parseAndAdapt(content)
        manifest.location = 'cache'
        return manifest
    }

    private parseAndAdapt(content: string): Manifest {
        try {
            const raw = JSON.parse(content) as unknown
            const manifest: unknown = this.adapter ? this.adapter.adapt(raw) : raw
            assertManifestShape(manifest)
            return manifest
        } catch (error) {
            throw new ToolkitError(
                `Failed to parse "${this.lsName}" manifest: ${error instanceof Error ? error.message : 'Unknown error'}`
            )
        }
    }

    private async saveManifestAtomic(content: string): Promise<void> {
        await fs.mkdir(this.cacheDir)
        const randomSuffix = crypto.randomBytes(8).toString('hex')
        const tempPath = `${this.manifestPath}.${process.pid}-${randomSuffix}.tmp`

        try {
            await fs.writeFile(tempPath, content)
            await fs.rename(tempPath, this.manifestPath)
            logger.debug(`Saved "${this.lsName}" manifest atomically to: ${this.manifestPath}`)
        } catch (err) {
            try {
                if (await fs.existsFile(tempPath)) {
                    await fs.delete(tempPath)
                }
            } catch {
                // Best-effort cleanup
            }
            logger.warn(`Failed to save "${this.lsName}" manifest: ${err}`)
        }
    }
}

function defaultSleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object'
}

/**
 * Rejects the whole manifest when any version cannot be evaluated for compatibility, so a malformed
 * manifest falls through to the cached manifest and installed servers instead of surfacing a
 * TypeError during version selection.
 */
function assertManifestShape(manifest: unknown): asserts manifest is Manifest {
    if (!isRecord(manifest) || !Array.isArray(manifest.versions)) {
        throw new Error("Manifest must contain a top-level 'versions' array")
    }
    for (const version of manifest.versions as unknown[]) {
        if (!isRecord(version) || typeof version.serverVersion !== 'string') {
            throw new Error("Manifest version entry is missing a 'serverVersion' string")
        }
        if (!Array.isArray(version.targets) || !version.targets.every(isRecord)) {
            throw new Error(`Manifest version "${version.serverVersion}" is missing a 'targets' array`)
        }
    }
}
