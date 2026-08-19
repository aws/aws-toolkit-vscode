/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../logger/logger'
import { ToolkitError } from '../errors'
import { Manifest } from './types'
import { StageResolver, tryStageResolvers } from './utils/setupStage'
import { fs } from '../fs/fs'
import * as path from 'path'
import * as crypto from 'crypto'
import * as localizedText from '../localizedText'
import { AmazonQPromptSettings, amazonQPrompts } from '../settings'

const logger = getLogger('lsp')

const maxRetries = 3
const baseDelayMs = 1000

export interface ManifestResolverConfig {
    /** URL to fetch the raw manifest JSON from. */
    manifestUrl: string
    /** Display name for the language server (used in log messages). */
    lsName: string
    /** Filesystem directory where manifest.json is cached. */
    cacheDir: string
    /**
     * Optional adapter that transforms raw JSON into a normalized Manifest.
     * When provided, the raw JSON is parsed as `unknown` and passed to this hook
     * BEFORE being cached to disk.
     */
    adapter?: ManifestAdapter
    /**
     * Prompt key prefix for user-facing deprecation suppression.
     * Combined with "LspManifestMessage" to form the full prompt key
     * (e.g. "cfnLsp" → "cfnLspLspManifestMessage").
     * If the resulting key does not exist in amazonQPrompts, deprecation
     * is logged without user toast.
     */
    suppressPrefix?: string
    /** Injectable fetch function for testing. Defaults to global `fetch`. */
    fetchFn?: typeof fetch
    /** Injectable sleep function for testing. Defaults to `setTimeout`-based delay. */
    sleepFn?: (ms: number) => Promise<void>
}

/**
 * Adapter interface for transforming raw manifest JSON into a normalized Manifest.
 */
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

    constructor(config: ManifestResolverConfig)
    /** @deprecated Use the config object constructor. */
    constructor(manifestUrl: string, lsName: string, suppressPrefix: string)
    constructor(configOrUrl: ManifestResolverConfig | string, lsName?: string, suppressPrefix?: string) {
        if (typeof configOrUrl === 'string') {
            this.manifestUrl = configOrUrl
            this.lsName = lsName!
            this.cacheDir = path.join(fs.getCacheDir(), 'aws', 'toolkits', 'language-servers', lsName!)
            this.adapter = undefined
            this.suppressPrefix = suppressPrefix || undefined
            this.fetchFn = globalThis.fetch
            this.sleepFn = defaultSleep
        } else {
            this.manifestUrl = configOrUrl.manifestUrl
            this.lsName = configOrUrl.lsName
            this.cacheDir = configOrUrl.cacheDir
            this.adapter = configOrUrl.adapter
            this.suppressPrefix = configOrUrl.suppressPrefix
            this.fetchFn = configOrUrl.fetchFn ?? globalThis.fetch
            this.sleepFn = configOrUrl.sleepFn ?? defaultSleep
        }
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

    /**
     * Uses existing AmazonQPromptSettings infrastructure for deprecation suppression.
     * If the prompt key does not exist in the registered settings, logs without toast.
     */
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
        let lastError: Error | undefined

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const response = await this.fetchFn(this.manifestUrl)
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
                }

                const content = await response.text()
                logger.debug(`Fetched "${this.lsName}" manifest (attempt ${attempt}): ${this.manifestUrl}`)

                const manifest = this.parseAndAdapt(content)
                await this.saveManifestAtomic(content)
                manifest.location = 'remote'
                return manifest
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
            if (this.adapter) {
                return this.adapter.adapt(raw)
            }
            if (raw === null || typeof raw !== 'object' || !Array.isArray((raw as Record<string, unknown>).versions)) {
                throw new Error("Manifest must contain a top-level 'versions' array")
            }
            return raw as Manifest
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
