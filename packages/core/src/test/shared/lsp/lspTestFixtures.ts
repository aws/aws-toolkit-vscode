/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Range } from 'semver'
import { Manifest, LspVersion } from '../../../shared/lsp/types'
import { TargetPlatform } from '../../../shared/lsp/utils/targetResolver'
import { LanguageServerResolver } from '../../../shared/lsp/lspResolver'
import { fs } from '../../../shared/fs/fs'
import { createTestWorkspaceFolder } from '../../testUtil'

/**
 * Default constants used across LSP test suites.
 */
export const lspTestDefaults = {
    lsName: 'test-server',
    manifestUrl: 'https://example.com/manifest.json',
    baseDir: '/tmp/test',
    hashAlgorithm: 'sha384' as const,
    versionRange: new Range('>=1.0.0', { includePrerelease: true }),
} as const

/**
 * Creates a minimal manifest fixture wrapping the given versions.
 */
export function createManifest(versions: LspVersion[]): Manifest {
    return {
        manifestSchemaVersion: '1.0',
        artifactId: 'test-server',
        artifactDescription: 'Test Language Server',
        isManifestDeprecated: false,
        versions,
    }
}

/**
 * Creates an LspVersion fixture with sensible defaults. Override via opts.
 */
export function createVersion(
    serverVersion: string,
    opts?: { platform?: string; arch?: string; hashes?: string[]; filename?: string; isDelisted?: boolean }
): LspVersion {
    return {
        serverVersion,
        isDelisted: opts?.isDelisted ?? false,
        targets: [
            {
                platform: opts?.platform ?? process.platform,
                arch: opts?.arch ?? process.arch,
                contents: [
                    {
                        filename: opts?.filename ?? `server-${serverVersion}.zip`,
                        url: `https://example.com/server-${serverVersion}.zip`,
                        hashes: opts?.hashes ?? [],
                        bytes: 1024,
                    },
                ],
            },
        ],
    }
}

/**
 * Creates an LspVersion with a fully custom single-target platform/arch/contents spec.
 * Use when the platform target tests need non-standard platform strings.
 */
export function createPlatformVersion(
    serverVersion: string,
    platform: string,
    arch: string,
    contents?: LspVersion['targets'][0]['contents']
): LspVersion {
    return {
        serverVersion,
        isDelisted: false,
        targets: [
            {
                platform,
                arch,
                contents: contents ?? [{ filename: 'server.zip', url: 'http://x', hashes: [], bytes: 100 }],
            },
        ],
    }
}

/**
 * Creates a LanguageServerResolver from a manifest and common defaults.
 * Accepts optional overrides for target resolver, fetch, sleep, etc.
 */
export function createResolver(
    manifest: Manifest,
    opts?: {
        baseDir?: string
        requiredFiles?: string[]
        targetPlatformResolver?: () => TargetPlatform
        fetchFn?: (...args: any[]) => Promise<any>
        sleepFn?: (ms: number) => Promise<void>
    }
): LanguageServerResolver {
    return new LanguageServerResolver(
        manifest,
        lspTestDefaults.lsName,
        lspTestDefaults.versionRange,
        lspTestDefaults.manifestUrl,
        undefined,
        lspTestDefaults.hashAlgorithm,
        opts?.baseDir ?? lspTestDefaults.baseDir,
        opts?.requiredFiles ?? [],
        opts?.targetPlatformResolver,
        opts?.fetchFn as any,
        opts?.sleepFn
    )
}

/**
 * Manages a temporary test directory with automatic cleanup.
 * Eliminates duplicated beforeEach/afterEach patterns.
 */
export class TempTestDir {
    private _dir: string | undefined

    /** The path to the temporary directory. Only valid after setup(). */
    get path(): string {
        if (!this._dir) {
            throw new Error('TempTestDir: call setup() in beforeEach first')
        }
        return this._dir
    }

    async setup(): Promise<string> {
        const folder = await createTestWorkspaceFolder()
        this._dir = folder.uri.fsPath
        return this._dir
    }

    async teardown(): Promise<void> {
        if (this._dir) {
            await fs.delete(this._dir, { force: true, recursive: true })
            this._dir = undefined
        }
    }
}

/**
 * JSON string of a standard valid manifest for ManifestResolver tests.
 */
export const validManifestJson = JSON.stringify({
    manifestSchemaVersion: '1.0',
    artifactId: 'test-lsp',
    artifactDescription: 'Test LSP',
    isManifestDeprecated: false,
    versions: [],
})

/**
 * JSON string of a channel-keyed manifest for adapter tests.
 */
export const channelKeyedManifestJson = JSON.stringify({
    manifestSchemaVersion: '2.0',
    artifactId: 'cfn-lsp',
    artifactDescription: 'CFN LSP',
    isManifestDeprecated: false,
    alpha: [
        { serverVersion: '1.0.0-alpha', isDelisted: false, targets: [] },
        { serverVersion: '1.1.0-alpha', isDelisted: false, targets: [] },
    ],
    beta: [{ serverVersion: '1.0.0-beta', isDelisted: false, targets: [] }],
    prod: [{ serverVersion: '1.0.0', isDelisted: false, targets: [] }],
})

/**
 * JSON string of a deprecated manifest for deprecation tests.
 */
export const deprecatedManifestJson = JSON.stringify({
    manifestSchemaVersion: '1.0',
    artifactId: 'test-lsp',
    artifactDescription: 'Test LSP',
    isManifestDeprecated: true,
    versions: [],
})
