/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AmazonQLspInstaller } from '../../../src/lsp/lspInstaller'
import { getAmazonQLspConfig } from '../../../src/lsp/config'
import { createLspInstallerTests } from './lspInstallerUtil'
import { LspConfig } from 'aws-core-vscode/amazonq'

describe('AmazonQLSP', () => {
    createLspInstallerTests({
        suiteName: 'AmazonQLSPInstaller',
        lspConfig: getAmazonQLspConfig(),
        createInstaller: (lspConfig?: LspConfig) => new AmazonQLspInstaller(lspConfig),
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
