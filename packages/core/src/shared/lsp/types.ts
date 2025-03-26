/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger } from '../logger/logger'
import { LanguageServerLocation, ManifestLocation } from '../telemetry/telemetry'

export const logger = getLogger('lsp')

export interface LspResult {
    location: LanguageServerLocation
    version: string
    assetDirectory: string
}

export interface ResourcePaths {
    lsp: string
    node: string
}

export interface LspResolution<T extends ResourcePaths> extends LspResult {
    resourcePaths: T
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
    location?: ManifestLocation
}

export interface VersionRange {
    start: number
    end: number
}
