/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { dirname, join } from 'path'
import { LspServerProviderI } from './lspServerProvider'
import { isDebugInstance } from '../../../shared/vscode/env'
import { CfnLspServerFile } from './lspServerConfig'

export class SettingsLspServerProvider implements LspServerProviderI {
    private readonly path?: string

    constructor(config?: { path?: string }) {
        this.path = config?.path
    }

    canProvide(): boolean {
        return isDebugInstance() && this.path !== undefined
    }

    async serverExecutable(): Promise<string> {
        const serverFile = join(this.path!, CfnLspServerFile)
        return Promise.resolve(serverFile)
    }

    async serverRootDir(): Promise<string> {
        return Promise.resolve(dirname(await this.serverExecutable()))
    }
}
