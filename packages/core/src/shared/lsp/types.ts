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
    /** Example: `"1.2.0"` */
    version: string
    /** Example: `"<cachedir>/aws/language-servers/cloudformation-languageserver/1.2.0"` */
    assetDirectory: string
}

/**
 * Example:
 * ```
 * resourcePaths = {
 *     lsp = '<cachedir>/aws/language-servers/cloudformation-languageserver/1.2.0/cfn-lsp-server-standalone.js'
 *     node = process.execPath
 * }
 * ```
 */
export interface ResourcePaths {
    /**
     * Path to `.js` bundle to be executed by `node`.
     * Example: `"<cachedir>/aws/language-servers/cloudformation-languageserver/1.2.0/cfn-lsp-server-standalone.js"`
     */
    lsp: string
    /**
     * Path to the `node` (or `node.exe`) executable that runs the server. The extension host's own Node
     * (`process.execPath`) is used; `vscode-languageclient` forks it in node mode.
     */
    node: string
}

export interface LspResolution<T extends ResourcePaths> extends LspResult {
    /**
     * Example:
     * ```
     * resourcePaths = {
     *     lsp = '<cachedir>/aws/language-servers/cloudformation-languageserver/1.2.0/cfn-lsp-server-standalone.js'
     *     node = process.execPath
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
    /**
     * I'm not sure if this **always** exists (couldn't find it in the spec)
     */
    thirdPartyLicenses?: string
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
