/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as os from 'os'
import { createLspInstallerTests } from './lspInstallerUtil'
import { getAmazonQWorkspaceLspConfig, LspClient, LspConfig, WorkspaceLspInstaller } from 'aws-core-vscode/amazonq'
import assert from 'assert'

describe('AmazonQWorkspaceLSP', () => {
    createLspInstallerTests({
        suiteName: 'AmazonQWorkspaceLSPInstaller',
        lspConfig: getAmazonQWorkspaceLspConfig(),
        createInstaller: (lspConfig?: LspConfig) => new WorkspaceLspInstaller.WorkspaceLspInstaller(lspConfig),
        targetContents: [
            {
                bytes: 0,
                filename: `qserver-${os.platform()}-${os.arch()}.zip`,
                hashes: [],
                url: 'http://fakeurl',
            },
        ],
        setEnv: (path: string) => {
            process.env.__AMAZONQWORKSPACELSP_PATH = path
        },
        resetEnv: () => {
            delete process.env.__AMAZONQWORKSPACELSP_PATH
        },
    })

    it('activates', async () => {
        const ok = await LspClient.instance.waitUntilReady()
        if (!ok) {
            assert.fail('Workspace context language server failed to become ready')
        }
        const serverUsage = await LspClient.instance.getLspServerUsage()
        if (!serverUsage) {
            assert.fail('Unable to verify that the workspace context language server has been activated')
        }
    })
})
