/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { dirname, join } from 'path'
import { ExtensionContext } from 'vscode'
import { LspServerProviderI } from './lspServerProvider'
import { CfnLspServerFile } from './lspServerConfig'
import { existsSync, readdirSync } from 'fs' // eslint-disable-line no-restricted-imports
import { isDebugInstance } from '../../../shared/vscode/env'
import { getLogger } from '../../../shared/logger/logger'

export class DevLspServerProvider implements LspServerProviderI {
    private readonly devServerLocation?: string

    constructor(context: ExtensionContext) {
        this.devServerLocation = findServerInDevelopment(context.extensionPath)
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

function findServerInDevelopment(path: string): string | undefined {
    const parentDir = dirname(dirname(dirname(path)))
    const possibleLocations = []

    // Get all directories in parent directory
    const siblingDirs = readdirSync(parentDir, { withFileTypes: true })
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name)

    // Check each sibling directory for bundle/development structure
    for (const siblingDir of siblingDirs) {
        const serverPath = join(parentDir, siblingDir, 'bundle', 'development', CfnLspServerFile)
        if (existsSync(serverPath)) {
            possibleLocations.push(serverPath)
        }
    }

    const validLocations = possibleLocations.filter((path) => {
        return existsSync(path)
    })

    if (validLocations.length < 1) {
        return undefined
    }

    if (validLocations.length === 1) {
        getLogger().debug(`Found CloudFormation LSP dev server ${possibleLocations[0]}`)
        return possibleLocations[0]
    }

    throw Error(
        `Found ${validLocations.length} locations with server executable file: ${JSON.stringify(possibleLocations)}`
    )
}
