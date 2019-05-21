/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import * as path from 'path'

import {
    Closeable,
    DefaultDockerClient,
    DockerInvokeArguments
} from '../../../shared/clients/dockerClient'

class MockCloseable implements Closeable {
    private callback?: (code: number, signal: string, args?: string[]) => void

    public onClose(callback: (code: number, signal: string, args?: string[]) => void): void {
        this.callback = callback
    }

    public close(code: number, signal: string, args?: string[]) {
        if (!this.callback) {
            throw new Error('Callback not set')
        }

        this.callback(code, signal, args)
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
            const closeable = new MockCloseable()
            const client = new DefaultDockerClient({
                spawn(command, args, options): Closeable {
                    spawnCount++
                    assert.ok(args)
                    assert.ok(args!.length)
                    assert.strictEqual(args![0], 'run')

                    return closeable
                }
            })

            const invokePromise = client.invoke(makeInvokeArgs({}))
            closeable.close(0, 'mysignal')
            await invokePromise

            assert.strictEqual(spawnCount, 1)
        })

        it('uses the specified image', async () => {
            let spawnCount = 0
            const closeable = new MockCloseable()
            const client = new DefaultDockerClient({
                spawn(command, args, options): Closeable {
                    spawnCount++
                    assert.strictEqual(args && args.some(arg => arg === 'myimage'), true)

                    return closeable
                }
            })

            const invokePromise = client.invoke(makeInvokeArgs({}))
            closeable.close(0, 'mysignal')
            await invokePromise

            assert.strictEqual(spawnCount, 1)
        })

        it('includes the --rm flag if specified', async () => {
            let spawnCount = 0
            const closeable = new MockCloseable()
            const client = new DefaultDockerClient({
                spawn(command, args, options): Closeable {
                    spawnCount++
                    assert.strictEqual(args && args.some(arg => arg === '--rm'), true)

                    return closeable
                }
            })

            const invokePromise = client.invoke(makeInvokeArgs({
                removeOnExit: true
            }))
            closeable.close(0, 'mysignal')
            await invokePromise

            assert.strictEqual(spawnCount, 1)
        })

        it('includes the --mount flag if specified', async () => {
            const source = path.join('my', 'src')
            const destination = path.join('my', 'dst')

            let spawnCount = 0
            const closeable = new MockCloseable()
            const client = new DefaultDockerClient({
                spawn(command, args, options): Closeable {
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

                    return closeable
                }
            })

            const invokePromise = client.invoke(makeInvokeArgs({
                mount: {
                    type: 'bind',
                    source,
                    destination
                }
            }))
            closeable.close(0, 'mysignal')
            await invokePromise

            assert.strictEqual(spawnCount, 1)
        })

        it('includes the --entryPoint flag if specified', async () => {
            const entryPointArgs = [
                'myArg1',
                'myArg2'
            ]
            let spawnCount = 0
            const closeable = new MockCloseable()
            const client = new DefaultDockerClient({
                spawn(command, args, options): Closeable {
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

                    const argsStartIndex = flagCommandIndex + 1
                    entryPointArgs.forEach((value, index) => {
                        const argIndex = argsStartIndex + index
                        assert.ok(argIndex < args!.length)
                        assert.strictEqual(args![argIndex], value)
                    })

                    return closeable
                }
            })

            const invokePromise = client.invoke(makeInvokeArgs({
                entryPoint: {
                    command: 'mycommand',
                    args: entryPointArgs
                }
            }))
            closeable.close(0, 'mysignal')
            await invokePromise

            assert.strictEqual(spawnCount, 1)
        })

        it('relies on PATH to locate docker', async () => {
            let spawnCount = 0
            const closeable = new MockCloseable()
            const client = new DefaultDockerClient({
                spawn(command, args, options): Closeable {
                    spawnCount++
                    assert.strictEqual(command, 'docker')

                    return closeable
                }
            })

            const invokePromise = client.invoke(makeInvokeArgs({}))
            closeable.close(0, 'mysignal')
            await invokePromise

            assert.strictEqual(spawnCount, 1)
        })

        it('uses verbatim arguments on windows', async () => {
            let spawnCount = 0
            const closeable = new MockCloseable()
            const client = new DefaultDockerClient({
                spawn(command, args, options): Closeable {
                    spawnCount++
                    assert.ok(options)
                    assert.strictEqual(options!.windowsVerbatimArguments, true)

                    return closeable
                }
            })

            const invokePromise = client.invoke(makeInvokeArgs({}))
            closeable.close(0, 'mysignal')
            await invokePromise

            assert.strictEqual(spawnCount, 1)
        })
    })
})
