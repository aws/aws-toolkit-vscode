/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger } from '../logger/logger'
import { LanguageServerLocation, ManifestLocation } from '../telemetry/telemetry'

export const logger = getLogger('lsp')

export interface LspResult {
    /** Example: `"cache"` */
    location: LanguageServerLocation
    /** Example: `"3.3.0"` */
    version: string
    /** Example: `"<cachedir>/aws/toolkits/language-servers/AmazonQ/3.3.0"` */
    assetDirectory: string
}

/**
 * Example:
 * ```
 * resourcePaths = {
 *     lsp = '<cachedir>/aws/toolkits/language-servers/AmazonQ/3.3.0/servers/aws-lsp-codewhisperer.js'
 *     node = '<cachedir>/aws/toolkits/language-servers/AmazonQ/3.3.0/servers/node'
 *     ui = '<cachedir>/aws/toolkits/language-servers/AmazonQ/3.3.0/clients/amazonq-ui.js'
 * }
 * ```
 */
export interface ResourcePaths {
    /**
     * Path to `.js` bundle to be executed by `node`.
     * Example: `"<cachedir>/aws/toolkits/language-servers/AmazonQ/3.3.0/servers/aws-lsp-codewhisperer.js"`
     */
    lsp: string
    /**
     * Path to `node` (or `node.exe`) executable/binary.
     * Example: `"<cachedir>/aws/toolkits/language-servers/AmazonQ/3.3.0/servers/node"`
     */
    node: string
}

export interface LspResolution<T extends ResourcePaths> extends LspResult {
    /**
     * Example:
     * ```
     * resourcePaths = {
     *     lsp = '<cachedir>/aws/toolkits/language-servers/AmazonQ/3.3.0/servers/aws-lsp-codewhisperer.js'
     *     node = '<cachedir>/aws/toolkits/language-servers/AmazonQ/3.3.0/servers/node'
     *     ui = '<cachedir>/aws/toolkits/language-servers/AmazonQ/3.3.0/clients/amazonq-ui.js'
     * }
     * ```
     */
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
