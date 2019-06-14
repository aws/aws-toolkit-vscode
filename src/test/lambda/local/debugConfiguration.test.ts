/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import * as os from 'os'
import * as path from 'path'

import {
    makeCoreCLRDebugConfiguration,
    MakeCoreCLRDebugConfigurationArguments
} from '../../../lambda/local/debugConfiguration'

describe('makeCoreCLRDebugConfiguration', async () => {
    function makeConfig({
        codeUri = path.join('foo', 'bar'),
        port = 42,
    }: Partial<MakeCoreCLRDebugConfigurationArguments>) {
        return makeCoreCLRDebugConfiguration({ codeUri, port })
    }

    it('uses the specified codeUri', async () => {
        const config = makeConfig({})

        assert.strictEqual(
            config.sourceFileMap['/var/task'],
            path.join('foo', 'bar')
        )
    })

    describe('windows', async () => {
        if (os.platform() === 'win32') {
            it('massages drive letters to uppercase', async () => {
                const config = makeConfig({ codeUri: 'c:\\foo\\bar' })

                assert.strictEqual(
                    config.windows.pipeTransport.pipeCwd,
                    'C:\\foo\\bar'
                )
            })
        }

        it('uses powershell', async () => {
            const config = makeConfig({})

            assert.strictEqual(config.windows.pipeTransport.pipeProgram, 'powershell')
        })

        it('uses the specified port', async () => {
            const config = makeConfig({ port: 538 })

            assert.strictEqual(config.windows.pipeTransport.pipeArgs.some(arg => arg.includes('538')), true)
        })
    })
    describe('*nix', async () => {
        it('uses the default shell', async () => {
            const config = makeConfig({})

            assert.strictEqual(config.pipeTransport.pipeProgram, 'sh')
        })

        it('uses the specified port', async () => {
            const config = makeConfig({ port: 538 })

            assert.strictEqual(config.pipeTransport.pipeArgs.some(arg => arg.includes('538')), true)
        })
    })
})
