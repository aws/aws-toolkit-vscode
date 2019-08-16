/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as path from 'path'

import { DefaultDockerClient, DockerInvokeArguments } from '../../../shared/clients/dockerClient'
import { MockOutputChannel } from '../../mockOutputChannel'

describe('DefaultDockerClient', async () => {
    const outputChannel = new MockOutputChannel()

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
            const client = new DefaultDockerClient(outputChannel, {
                async run(args): Promise<void> {
                    spawnCount++
                    assert.ok(args)
                    assert.ok(args!.length)
                    assert.strictEqual(args![0], 'run')
                }
            })

            await client.invoke(makeInvokeArgs({}))

            assert.strictEqual(spawnCount, 1)
        })

        it('uses the specified image', async () => {
            let spawnCount = 0
            const client = new DefaultDockerClient(outputChannel, {
                async run(args): Promise<void> {
                    spawnCount++
                    assert.strictEqual(args && args.some(arg => arg === 'myimage'), true)
                }
            })

            await client.invoke(makeInvokeArgs({}))

            assert.strictEqual(spawnCount, 1)
        })

        it('includes the --rm flag if specified', async () => {
            let spawnCount = 0
            const client = new DefaultDockerClient(outputChannel, {
                async run(args): Promise<void> {
                    spawnCount++
                    assert.strictEqual(args && args.some(arg => arg === '--rm'), true)
                }
            })

            await client.invoke(
                makeInvokeArgs({
                    removeOnExit: true
                })
            )

            assert.strictEqual(spawnCount, 1)
        })

        it('includes the --mount flag if specified', async () => {
            const source = path.join('my', 'src')
            const destination = path.join('my', 'dst')

            let spawnCount = 0
            const client = new DefaultDockerClient(outputChannel, {
                async run(args): Promise<void> {
                    spawnCount++

                    assert.ok(args)

                    const flagIndex = args!.findIndex(value => value === '--mount')
                    assert.notStrictEqual(flagIndex, -1)

                    const flagValueIndex = flagIndex + 1
                    assert.ok(flagValueIndex < args!.length)
                    assert.strictEqual(args![flagValueIndex], `type=bind,src=${source},dst=${destination}`)
                }
            })

            await client.invoke(
                makeInvokeArgs({
                    mount: {
                        type: 'bind',
                        source,
                        destination
                    }
                })
            )

            assert.strictEqual(spawnCount, 1)
        })

        it('includes the --entryPoint flag if specified', async () => {
            const entryPointArgs = ['myArg1', 'myArg2']
            let spawnCount = 0
            const client = new DefaultDockerClient(outputChannel, {
                async run(args): Promise<void> {
                    spawnCount++

                    assert.ok(args)

                    const flagIndex = args!.findIndex(value => value === '--entrypoint')
                    assert.notStrictEqual(flagIndex, -1)

                    const flagCommandIndex = flagIndex + 1
                    assert.ok(flagCommandIndex < args!.length)
                    assert.strictEqual(args![flagCommandIndex], 'mycommand')

                    const endIndex = args!.length - 1
                    entryPointArgs.reverse().forEach((value, index) => {
                        const argIndex = endIndex - index
                        assert.ok(argIndex < args!.length)
                        assert.strictEqual(args![argIndex], value)
                    })
                }
            })

            await client.invoke(
                makeInvokeArgs({
                    entryPoint: {
                        command: 'mycommand',
                        args: entryPointArgs
                    }
                })
            )

            assert.strictEqual(spawnCount, 1)
        })
    })
})
