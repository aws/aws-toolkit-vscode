/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AmazonQLspInstaller } from '../../../src/lsp/lspInstaller'
import { defaultAmazonQLspConfig } from '../../../src/lsp/config'
import { createLspInstallerTests } from './lspInstallerUtil'
import { BaseLspInstaller } from 'aws-core-vscode/shared'

describe('AmazonQLSP', () => {
    createLspInstallerTests({
        suiteName: 'AmazonQLSPInstaller',
        lspConfig: defaultAmazonQLspConfig,
        createInstaller: (lspConfig?: BaseLspInstaller.LspConfig) => new AmazonQLspInstaller(lspConfig),
        targetContents: [
            {
                bytes: 0,
                filename: 'servers.zip',
                hashes: [],
                url: 'http://fakeurl',
            },
        ],
        setEnv: (path: string) => {
            process.env.__AMAZONQLSP_PATH = path
        },
        resetEnv: () => {
            delete process.env.__AMAZONQLSP_PATH
        },
    })
})
