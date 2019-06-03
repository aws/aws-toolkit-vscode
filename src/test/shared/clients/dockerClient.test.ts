/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import * as path from 'path'

import {
    DefaultDockerClient,
    DockerInvokeArguments
} from '../../../shared/clients/dockerClient'
import { ChildProcessResult } from '../../../shared/utilities/childProcess'

function makeResult(
    {
        exitCode = 0,
        error,
        stdout = '',
        stderr = ''
    }: Partial<ChildProcessResult>
): ChildProcessResult {
    return {
        exitCode,
        error,
        stdout,
        stderr
    }
}

describe('DefaultDockerClient', async () => {
    function makeInvokeArgs({
        command = 'run',
        image = 'myimage',
        ...rest
    }: Partial<DockerInvokeArguments>): DockerInvokeArguments {
        return {
            command,
            image,
            ...rest
        }
    }

    describe('invoke', async () => {
        it('uses the specified command', async () => {
            let spawnCount = 0
            const client = new DefaultDockerClient({
                async run(args): Promise<ChildProcessResult> {
                    spawnCount++
                    assert.ok(args)
                    assert.ok(args!.length)
                    assert.strictEqual(args![0], 'run')

                    return makeResult({})
                }
            })

            await client.invoke(makeInvokeArgs({}))

            assert.strictEqual(spawnCount, 1)
        })

        it('uses the specified image', async () => {
            let spawnCount = 0
            const client = new DefaultDockerClient({
                async run(args): Promise<ChildProcessResult> {
                    spawnCount++
                    assert.strictEqual(args && args.some(arg => arg === 'myimage'), true)

                    return makeResult({})
                }

            })

            await client.invoke(makeInvokeArgs({}))

            assert.strictEqual(spawnCount, 1)
        })

        it('includes the --rm flag if specified', async () => {
            let spawnCount = 0
            const client = new DefaultDockerClient({
                async run(args): Promise<ChildProcessResult> {
                    spawnCount++
                    assert.strictEqual(args && args.some(arg => arg === '--rm'), true)

                    return makeResult({})
                }
            })

            await client.invoke(makeInvokeArgs({
                removeOnExit: true
            }))

            assert.strictEqual(spawnCount, 1)
        })

        it('includes the --mount flag if specified', async () => {
            const source = path.join('my', 'src')
            const destination = path.join('my', 'dst')

            let spawnCount = 0
            const client = new DefaultDockerClient({
                async run(args): Promise<ChildProcessResult> {
                    spawnCount++

                    assert.ok(args)

                    const flagIndex = args!.findIndex(value => value === '--mount')
                    assert.notStrictEqual(flagIndex, -1)

                    const flagValueIndex = flagIndex + 1
                    assert.ok(flagValueIndex < args!.length)
                    assert.strictEqual(
                        args![flagValueIndex],
                        `type=bind,src=${source},dst=${destination}`
                    )

                    return makeResult({})
                }
            })

            await client.invoke(makeInvokeArgs({
                mount: {
                    type: 'bind',
                    source,
                    destination
                }
            }))

            assert.strictEqual(spawnCount, 1)
        })

        it('includes the --entryPoint flag if specified', async () => {
            const entryPointArgs = [
                'myArg1',
                'myArg2'
            ]
            let spawnCount = 0
            const client = new DefaultDockerClient({
                async run(args): Promise<ChildProcessResult> {
                    spawnCount++

                    assert.ok(args)

                    const flagIndex = args!.findIndex(value => value === '--entrypoint')
                    assert.notStrictEqual(flagIndex, -1)

                    const flagCommandIndex = flagIndex + 1
                    assert.ok(flagCommandIndex < args!.length)
                    assert.strictEqual(
                        args![flagCommandIndex],
                        'mycommand'
                    )

                    const endIndex = (args!.length - 1)
                    entryPointArgs.reverse().forEach((value, index) => {
                        const argIndex = endIndex - index
                        assert.ok(argIndex < args!.length)
                        assert.strictEqual(args![argIndex], value)
                    })

                    return makeResult({})
                }
            })

            await client.invoke(makeInvokeArgs({
                entryPoint: {
                    command: 'mycommand',
                    args: entryPointArgs
                }
            }))

            assert.strictEqual(spawnCount, 1)
        })
    })
})
