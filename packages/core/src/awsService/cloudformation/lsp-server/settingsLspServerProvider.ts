/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { dirname, join } from 'path'
import { existsSync } from 'fs' // eslint-disable-line no-restricted-imports
import { LspServerProviderI } from './lspServerProvider'
import { CfnLspServerFile } from './lspServerConfig'
import { isDebugInstance } from '../../../shared/vscode/env'
import { getLogger } from '../../../shared/logger/logger'

export class SettingsLspServerProvider implements LspServerProviderI {
    private readonly path?: string

    constructor(config?: { path?: string }) {
        this.path = config?.path
    }

    name(): string {
        return 'SettingsLspServerProvider'
    }

    /**
     * Only provides when BOTH conditions are met:
     * 1. Running in a debug instance (isDebugInstance())
     * 2. A valid path is configured AND exists on disk
     */
    canProvide(): boolean {
        if (!isDebugInstance()) {
            return false
        }
        if (!this.path) {
            return false
        }
        // Validate that the path exists on disk
        try {
            return existsSync(this.path)
        } catch {
            getLogger('awsCfnLsp').warn(`SettingsLspServerProvider: path validation failed for "${this.path}"`)
            return false
        }
    }

    async serverExecutable(): Promise<string> {
        if (!this.path) {
            throw new Error('SettingsLspServerProvider: path is not configured')
        }
        const serverFile = join(this.path, CfnLspServerFile)
        return Promise.resolve(serverFile)
    }

    async serverRootDir(): Promise<string> {
        return Promise.resolve(dirname(await this.serverExecutable()))
    }
}
