/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as path from 'path'
import { NodeModule, TransportKind } from 'vscode-languageclient/node'
import { CfnDocumentSelector, cfnServerOptions } from '../../../../awsService/cloudformation/lsp-server/lspClientConfig'
import { CfnLspServerFile } from '../../../../awsService/cloudformation/lsp-server/lspServerConfig'

const installDirectory = path.join(
    path.sep,
    'cache',
    'aws',
    'language-servers',
    'cloudformation-languageserver',
    '1.2.0'
)
const serverPath = path.join(installDirectory, CfnLspServerFile)

/** The file extensions CloudFormation templates are commonly saved with. */
const templateExtensions = ['yaml', 'yml', 'json', 'template', 'cfn', 'txt']

function serverModes(): { run: NodeModule; debug: NodeModule } {
    return cfnServerOptions(serverPath) as { run: NodeModule; debug: NodeModule }
}

describe('CloudFormation LSP cfnServerOptions', function () {
    it('runs the server bundle from its own directory in both run and debug mode', function () {
        const { run, debug } = serverModes()

        assert.strictEqual(run.options?.cwd, installDirectory)
        assert.strictEqual(debug.options?.cwd, installDirectory)
    })

    it('launches the resolved bundle over IPC with source maps enabled in both modes', function () {
        const { run, debug } = serverModes()

        for (const mode of [run, debug]) {
            assert.strictEqual(mode.module, serverPath)
            assert.strictEqual(mode.transport, TransportKind.ipc)
            assert.strictEqual(mode.options?.env?.NODE_OPTIONS, '--enable-source-maps')
        }
    })

    it('disables lazy compilation only in debug mode', function () {
        const { run, debug } = serverModes()

        assert.deepStrictEqual(debug.options?.execArgv, ['--no-lazy'])
        assert.strictEqual(run.options?.execArgv, undefined)
    })
})

describe('CloudFormation LSP CfnDocumentSelector', function () {
    it('covers every file extension CloudFormation templates are commonly saved with', function () {
        const patterns = CfnDocumentSelector.map((filter) => filter.pattern)

        for (const extension of templateExtensions) {
            assert.ok(patterns.includes(`**/*.${extension}`), `missing selector pattern for .${extension}`)
        }
    })

    it('only attaches to documents on disk', function () {
        for (const filter of CfnDocumentSelector) {
            assert.strictEqual(filter.scheme, 'file', `${filter.language ?? filter.pattern} is not file-scoped`)
        }
    })
})
