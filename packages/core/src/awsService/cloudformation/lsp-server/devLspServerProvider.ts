/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { dirname, join, resolve } from 'path'
import { ExtensionContext } from 'vscode'
import { LspServerProviderI } from './lspServerProvider'
import { CfnLspServerFile } from './lspServerConfig'
import { existsSync, readdirSync } from 'fs' // eslint-disable-line no-restricted-imports
import { isDebugInstance } from '../../../shared/vscode/env'
import { getLogger } from '../../../shared/logger/logger'

/**
 * Maximum number of parent directories to walk when searching for the dev server.
 * Prevents unbounded filesystem traversal.
 */
const maxParentWalkDepth = 3

export class DevLspServerProvider implements LspServerProviderI {
    private readonly devServerLocation?: string

    constructor(context: ExtensionContext) {
        // Only attempt dev server discovery in alpha/debug mode
        if (isDebugInstance()) {
            this.devServerLocation = findServerInDevelopment(context.extensionPath)
        }
    }

    name(): string {
        return 'DevLspServerProvider'
    }

    canProvide(): boolean {
        return isDebugInstance() && this.devServerLocation !== undefined
    }

    async serverExecutable(): Promise<string> {
        return Promise.resolve(this.devServerLocation!)
    }

    async serverRootDir(): Promise<string> {
        return Promise.resolve(dirname(this.devServerLocation!))
    }
}

function findServerInDevelopment(extensionPath: string): string | undefined {
    // Validate path before walking
    if (!extensionPath || !existsSync(extensionPath)) {
        return undefined
    }

    const resolvedPath = resolve(extensionPath)

    // Walk up with bounded depth to find a suitable parent
    let searchDir = resolvedPath
    for (let depth = 0; depth < maxParentWalkDepth; depth++) {
        const parent = dirname(searchDir)
        if (parent === searchDir) {
            // Reached filesystem root
            break
        }
        searchDir = parent
    }

    // searchDir is now the bounded parent directory
    const possibleLocations: string[] = []

    try {
        // Get all directories in the bounded parent directory
        const siblingDirs = readdirSync(searchDir, { withFileTypes: true })
            .filter((dirent) => dirent.isDirectory())
            .map((dirent) => dirent.name)

        // Check each sibling directory for bundle/development structure
        for (const siblingDir of siblingDirs) {
            const serverPath = join(searchDir, siblingDir, 'bundle', 'development', CfnLspServerFile)
            if (existsSync(serverPath)) {
                possibleLocations.push(serverPath)
            }
        }
    } catch {
        return undefined
    }

    if (possibleLocations.length < 1) {
        return undefined
    }

    if (possibleLocations.length === 1) {
        getLogger().debug(`Found CloudFormation LSP dev server ${possibleLocations[0]}`)
        return possibleLocations[0]
    }

    throw Error(
        `Found ${possibleLocations.length} locations with server executable file: ${JSON.stringify(possibleLocations)}`
    )
}
