/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as fs from 'fs-extra'
import * as os from 'os'
import * as path from 'path'
import { makeTemporaryToolkitFolder, tryRemoveFolder } from '../../../shared/filesystemUtilities'
import { ChildProcess, eof } from '../../../shared/utilities/childProcess'
import { sleep } from '../../../shared/utilities/timeoutUtils'
import { Timeout, waitUntil } from '../../../shared/utilities/timeoutUtils'

describe('ChildProcess', async function () {
    let tempFolder: string

    beforeEach(async function () {
        // Make a temp folder for all these tests
        // Stick some temp credentials files in there to load from
        tempFolder = await makeTemporaryToolkitFolder()
    })

    afterEach(async function () {
        await tryRemoveFolder(tempFolder)
    })

    describe('run', async function () {
        async function assertRegularRun(childProcess: ChildProcess): Promise<void> {
            const result = await childProcess.run()
            assert.strictEqual(result.exitCode, 0, 'Unexpected close code')
            assert.strictEqual(result.stdout, 'hi', 'Unexpected stdout')
        }

        if (process.platform === 'win32') {
            it('starts and captures stdout - windows', async function () {
                const batchFile = path.join(tempFolder, 'test-script.bat')
                writeBatchFile(batchFile)

                const childProcess = new ChildProcess(batchFile)

                await assertRegularRun(childProcess)
            })

            it('runs cmd files containing a space in the filename and folder', async function () {
                const subfolder: string = path.join(tempFolder, 'sub folder')
                const command: string = path.join(subfolder, 'test script.cmd')

                fs.mkdirSync(subfolder)

                writeWindowsCommandFile(command)

                const childProcess = new ChildProcess(command)

                await assertRegularRun(childProcess)
            })

            it('errs when starting twice - windows', async function () {
                const batchFile = path.join(tempFolder, 'test-script.bat')
                writeBatchFile(batchFile)

                const childProcess = new ChildProcess(batchFile)

                // We want to verify that the error is thrown even if the first
                // invocation is still in progress, so we don't await the promise.
                childProcess.run().catch(() => {
                    // Do nothing.
                })

                try {
                    await childProcess.run()
                } catch (err) {
                    return
                }

                assert.fail('Expected exception, but none was thrown.')
            })
        } // END Windows only tests

        if (process.platform !== 'win32') {
            it('runs and captures stdout - unix', async function () {
                const scriptFile = path.join(tempFolder, 'test-script.sh')
                writeShellFile(scriptFile)

                const childProcess = new ChildProcess(scriptFile)

                await assertRegularRun(childProcess)
            })

            it('errs when starting twice - unix', async function () {
                const scriptFile = path.join(tempFolder, 'test-script.sh')
                writeShellFile(scriptFile)

                const childProcess = new ChildProcess(scriptFile)

                // We want to verify that the error is thrown even if the first
                // invocation is still in progress, so we don't await the promise.
                childProcess.run().catch(() => {
                    // Do nothing.
                })

                try {
                    await childProcess.run()
                } catch (err) {
                    return
                }

                assert.fail('Expected exception, but none was thrown.')
            })
        } // END Linux only tests

        it('runs scripts containing a space in the filename and folder', async function () {
            const subfolder: string = path.join(tempFolder, 'sub folder')
            let command: string

            fs.mkdirSync(subfolder)

            if (process.platform === 'win32') {
                command = path.join(subfolder, 'test script.bat')
                writeBatchFile(command)
            } else {
                command = path.join(subfolder, 'test script.sh')
                writeShellFile(command)
            }

            const childProcess = new ChildProcess(command)

            await assertRegularRun(childProcess)
        })

        it('reports error for missing executable', async function () {
            const batchFile = path.join(tempFolder, 'nonExistentScript')

            const childProcess = new ChildProcess(batchFile)

            const result = await childProcess.run()
            assert.notStrictEqual(result.exitCode, 0, 'Expected an error close code')
        })

        describe('Extra options', function () {
            let childProcess: ChildProcess

            beforeEach(function () {
                const isWindows = process.platform === 'win32'
                const command = path.join(tempFolder, `test-script.${isWindows ? 'bat' : 'sh'}`)

                if (isWindows) {
                    writeBatchFile(command, ['@echo %1', '@echo %2', '@echo "%3"', 'SLEEP 20', 'exit 1'].join(os.EOL))
                } else {
                    writeShellFile(command, ['echo $1', 'echo $2', 'echo "$3"', 'sleep 20', 'exit 1'].join(os.EOL))
                }

                childProcess = new ChildProcess(command, ['1', '2'], { collect: false })
            })

            it('can report errors', async function () {
                const result = childProcess.run({
                    rejectOnError: true,
                    useForceStop: true,
                    onStdout: (text, context) => {
                        if (text.includes('2')) {
                            context.reportError('Got 2')
                        }
                    },
                })

                return assert.rejects(result, { message: 'Got 2' })
            })

            it('can reject on errors if `rejectOnError` is set', async function () {
                return await assert.rejects(() =>
                    childProcess.run({
                        rejectOnError: true,
                        onStdout: (text, context) => {
                            context.reportError('An error')
                        },
                    })
                )
            })

            it('kills the process if an error is reported', async function () {
                const result = await childProcess.run({
                    waitForStreams: false,
                    onStdout: (text, context) => {
                        context.reportError('An error')
                    },
                })
                assert.notStrictEqual(result.exitCode, 1)
            })

            it('can merge with base options', async function () {
                const result = await childProcess.run({
                    collect: true,
                    waitForStreams: false,
                    extraArgs: ['4'],
                    onStdout: (text, context) => {
                        if (text.includes('4')) {
                            context.reportError('Got 4')
                        }
                    },
                })
                assert.ok(result.stdout.length !== 0)
                assert.ok(result.error?.message.includes('Got 4'))
            })

            it('uses `Timeout` objects', async function () {
                await childProcess.run({
                    waitForStreams: false,
                    timeout: new Timeout(10),
                })
                assert.strictEqual(childProcess.result()?.signal, 'SIGTERM')
                assert.notStrictEqual(childProcess.result()?.error, undefined)
            })

            it('still runs if the timer completed (not rejected) after starting', async function () {
                const timer = new Timeout(10)
                setTimeout(() => timer.dispose())
                await childProcess.run({
                    waitForStreams: false,
                    onStdout: (text, context) => {
                        context.reportError('Got stuff')
                    },
                })

                assert.strictEqual(childProcess.result()?.error?.message, 'Got stuff')
            })

            it('rejects if using a completed timer', async function () {
                const timer = new Timeout(10)
                timer.dispose()
                await assert.rejects(childProcess.run({ timeout: timer }))
                assert.strictEqual(childProcess.result(), undefined)
                // Just make sure no process was ever ran
                await sleep(20)
                assert.strictEqual(childProcess.result(), undefined)
            })
        })
    })

    describe('stop()', async function () {
        if (process.platform === 'win32') {
            it('detects running processes and successfully stops a running process - Windows', async function () {
                const batchFile = path.join(tempFolder, 'test-script.bat')
                writeBatchFileWithDelays(batchFile)

                const childProcess = new ChildProcess(batchFile)

                // `await` is intentionally not used, we want to check the process while it runs.
                childProcess.run().catch(() => {
                    // Do nothing.
                })

                assert.strictEqual(childProcess.stopped, false)
                childProcess.stop()
                await waitUntil(async () => childProcess.stopped, { timeout: 1000, interval: 100, truthy: true })
                assert.strictEqual(childProcess.stopped, true)
            })

            it('can stop() previously stopped processes - Windows', async function () {
                const batchFile = path.join(tempFolder, 'test-script.bat')
                writeBatchFileWithDelays(batchFile)

                const childProcess = new ChildProcess(batchFile)

                // `await` is intentionally not used, we want to check the process while it runs.
                childProcess.run().catch(() => {
                    // Do nothing.
                })

                childProcess.stop()
                await waitUntil(async () => childProcess.stopped, { timeout: 1000, interval: 100, truthy: true })
                assert.strictEqual(childProcess.stopped, true)
                assert.doesNotThrow(() => childProcess.stop())
            })
        } // END Windows-only tests

        if (process.platform !== 'win32') {
            it('detects running processes and successfully stops a running process - Unix', async function () {
                const scriptFile = path.join(tempFolder, 'test-script.sh')
                writeShellFileWithDelays(scriptFile)

                const childProcess = new ChildProcess('sh', [scriptFile])
                const result = childProcess.run()

                assert.strictEqual(childProcess.stopped, false)
                childProcess.stop()
                await result

                assert.strictEqual(childProcess.stopped, true)
            })

            it('can stop() previously stopped processes - Unix', async function () {
                const scriptFile = path.join(tempFolder, 'test-script.sh')
                writeShellFileWithDelays(scriptFile)

                const childProcess = new ChildProcess(scriptFile)

                const result = childProcess.run()

                childProcess.stop()
                await result

                assert.strictEqual(childProcess.stopped, true)
                assert.doesNotThrow(() => childProcess.stop())
            })

            it('can send input - Unix', async function () {
                const childProcess = new ChildProcess('cat')
                const result = childProcess.run()
                await childProcess.send('foo')
                await childProcess.send(eof)
                const { stdout } = await result
                assert.strictEqual(stdout, 'foo')
            })
        } // END Unix-only tests
    })

    function writeBatchFile(filename: string, contents?: string): void {
        fs.writeFileSync(filename, contents ?? '@echo hi')
    }

    function writeBatchFileWithDelays(filename: string): void {
        const file = `
        @echo hi
        SLEEP 20
        @echo bye`
        fs.writeFileSync(filename, file)
    }

    function writeWindowsCommandFile(filename: string): void {
        fs.writeFileSync(filename, `@echo OFF${os.EOL}echo hi`)
    }

    function writeShellFile(filename: string, contents = 'echo hi'): void {
        fs.writeFileSync(filename, `#!/bin/sh\n${contents}`)
        fs.chmodSync(filename, 0o744)
    }

    function writeShellFileWithDelays(filename: string): void {
        const file = `
        echo hi
        sleep 20
        echo bye`
        writeShellFile(filename, file)
    }
})
