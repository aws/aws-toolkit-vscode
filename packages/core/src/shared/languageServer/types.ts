/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger } from '../logger/logger'

export const logger = getLogger('lsp')

type Location = 'remote' | 'cache' | 'override' | 'fallback' | 'unknown'

export interface LspResult {
    location: Location
    version: string
    assetDirectory: string
}

export interface LspResolver {
    resolve(): Promise<LspResult>
}

export interface TargetContent {
    filename: string
    url: string
    hashes: string[]
    bytes: number
    serverVersion?: string
}

export interface Target {
    platform: string
    arch: string
    contents: TargetContent[]
}

export interface LspVersion {
    serverVersion: string
    isDelisted: boolean
    targets: Target[]
}

export interface Manifest {
    manifestSchemaVersion: string
    artifactId: string
    artifactDescription: string
    isManifestDeprecated: boolean
    versions: LspVersion[]
}

export interface VersionRange {
    start: number
    end: number
}
