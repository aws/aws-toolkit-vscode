/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as fs from 'fs-extra'
import * as os from 'os'
import * as path from 'path'
import { makeTemporaryToolkitFolder } from '../../../shared/filesystemUtilities'
import { ChildProcess, ChildProcessResult } from '../../../shared/utilities/childProcess'
import { waitUntil } from '../../../shared/utilities/timeoutUtils'

describe('ChildProcess', async () => {
    let tempFolder: string

    beforeEach(async () => {
        // Make a temp folder for all these tests
        // Stick some temp credentials files in there to load from
        tempFolder = await makeTemporaryToolkitFolder()
    })

    afterEach(async () => {
        await fs.remove(tempFolder)
    })

    describe('run', async () => {
        if (process.platform === 'win32') {
            it('runs and captures stdout - windows', async () => {
                const batchFile = path.join(tempFolder, 'test-script.bat')
                writeBatchFile(batchFile)

                const childProcess = new ChildProcess(batchFile)

                const result = await childProcess.run()

                validateChildProcessResult({
                    childProcessResult: result,
                    expectedExitCode: 0,
                    expectedOutput: 'hi',
                })
            })

            it('runs cmd files containing a space in the filename and folder', async () => {
                const subfolder: string = path.join(tempFolder, 'sub folder')
                const command: string = path.join(subfolder, 'test script.cmd')

                fs.mkdirSync(subfolder)

                writeWindowsCommandFile(command)

                const childProcess = new ChildProcess(command)

                const result = await childProcess.run()

                validateChildProcessResult({
                    childProcessResult: result,
                    expectedExitCode: 0,
                    expectedOutput: 'hi',
                })
            })

            it('errs when starting twice - windows', async () => {
                const batchFile = path.join(tempFolder, 'test-script.bat')
                writeBatchFile(batchFile)

                const childProcess = new ChildProcess(batchFile)

                // We want to verify that the error is thrown even if the first
                // invocation is still in progress, so we don't await the promise.
                childProcess.run()

                try {
                    await childProcess.run()
                } catch (err) {
                    return
                }

                assert.fail('Expected exception, but none was thrown.')
            })
        } else {
            it('runs and captures stdout - unix', async () => {
                const scriptFile = path.join(tempFolder, 'test-script.sh')
                writeShellFile(scriptFile)

                const childProcess = new ChildProcess(scriptFile)

                const result = await childProcess.run()

                validateChildProcessResult({
                    childProcessResult: result,
                    expectedExitCode: 0,
                    expectedOutput: 'hi',
                })
            })

            it('errs when starting twice - unix', async () => {
                const scriptFile = path.join(tempFolder, 'test-script.sh')
                writeShellFile(scriptFile)

                const childProcess = new ChildProcess(scriptFile)

                // We want to verify that the error is thrown even if the first
                // invocation is still in progress, so we don't await the promise.
                childProcess.run()

                try {
                    await childProcess.run()
                } catch (err) {
                    return
                }

                assert.fail('Expected exception, but none was thrown.')
            })
        } // END Linux only tests

        it('runs scripts containing a space in the filename and folder', async () => {
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

            const result = await childProcess.run()

            validateChildProcessResult({
                childProcessResult: result,
                expectedExitCode: 0,
                expectedOutput: 'hi',
            })
        })

        it('reports error for missing executable', async () => {
            const batchFile = path.join(tempFolder, 'nonExistentScript')

            const childProcess = new ChildProcess(batchFile)

            const result = await childProcess.run()

            assert.notStrictEqual(result.exitCode, 0)
            assert.notStrictEqual(result.error, undefined)
        })

        function validateChildProcessResult({
            childProcessResult,
            expectedExitCode,
            expectedOutput,
        }: {
            childProcessResult: ChildProcessResult
            expectedExitCode: number
            expectedOutput: string
        }) {
            assert.strictEqual(
                childProcessResult.exitCode,
                expectedExitCode,
                `Expected exit code ${expectedExitCode}, got ${childProcessResult.exitCode}`
            )

            assert.strictEqual(
                childProcessResult.stdout,
                expectedOutput,
                `Expected stdout to be ${expectedOutput} , got: ${childProcessResult.stdout}`
            )
        }
    })

    describe('start', async () => {
        async function assertRegularRun(childProcess: ChildProcess): Promise<void> {
            await new Promise<void>(async (resolve, reject) => {
                await childProcess.start({
                    onStdout: text => {
                        assert.strictEqual(text, 'hi' + os.EOL, 'Unexpected stdout')
                    },
                    onClose: (code, signal) => {
                        assert.strictEqual(code, 0, 'Unexpected close code')
                        resolve()
                    },
                })
            })
        }

        if (process.platform === 'win32') {
            it('starts and captures stdout - windows', async () => {
                const batchFile = path.join(tempFolder, 'test-script.bat')
                writeBatchFile(batchFile)

                const childProcess = new ChildProcess(batchFile)

                await assertRegularRun(childProcess)
            })

            it('runs cmd files containing a space in the filename and folder', async () => {
                const subfolder: string = path.join(tempFolder, 'sub folder')
                const command: string = path.join(subfolder, 'test script.cmd')

                fs.mkdirSync(subfolder)

                writeWindowsCommandFile(command)

                const childProcess = new ChildProcess(command)

                await assertRegularRun(childProcess)
            })

            it('errs when starting twice - windows', async () => {
                const batchFile = path.join(tempFolder, 'test-script.bat')
                writeBatchFile(batchFile)

                const childProcess = new ChildProcess(batchFile)

                // We want to verify that the error is thrown even if the first
                // invocation is still in progress, so we don't await the promise.
                childProcess.start({})

                try {
                    await childProcess.start({})
                } catch (err) {
                    return
                }

                assert.fail('Expected exception, but none was thrown.')
            })
        } // END Windows only tests

        if (process.platform !== 'win32') {
            it('runs and captures stdout - unix', async () => {
                const scriptFile = path.join(tempFolder, 'test-script.sh')
                writeShellFile(scriptFile)

                const childProcess = new ChildProcess(scriptFile)

                await assertRegularRun(childProcess)
            })

            it('errs when starting twice - unix', async () => {
                const scriptFile = path.join(tempFolder, 'test-script.sh')
                writeShellFile(scriptFile)

                const childProcess = new ChildProcess(scriptFile)

                // We want to verify that the error is thrown even if the first
                // invocation is still in progress, so we don't await the promise.
                childProcess.start({})

                try {
                    await childProcess.start({})
                } catch (err) {
                    return
                }

                assert.fail('Expected exception, but none was thrown.')
            })
        } // END Linux only tests

        it('runs scripts containing a space in the filename and folder', async () => {
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

        it('reports error for missing executable', async () => {
            const batchFile = path.join(tempFolder, 'nonExistentScript')

            const childProcess = new ChildProcess(batchFile)

            await new Promise<void>(async (resolve, reject) => {
                await childProcess.start({
                    onClose: (code, signal) => {
                        assert.notStrictEqual(code, 0, 'Expected an error close code')
                        resolve()
                    },
                })
            })
        })
    })

    describe('stop()', async () => {
        if (process.platform === 'win32') {
            it('detects running processes and successfully stops a running process - Windows', async () => {
                const batchFile = path.join(tempFolder, 'test-script.bat')
                writeBatchFileWithDelays(batchFile)

                const childProcess = new ChildProcess(batchFile)

                // `await` is intentionally not used, we want to check the process while it runs.
                childProcess.run()

                assert.strictEqual(childProcess.stopped, false)
                childProcess.stop()
                await waitUntil(
                    async () => {
                        return childProcess.stopped === true
                    },
                    { timeout: 1000, interval: 100 }
                )
                assert.strictEqual(childProcess.stopped, true)
            })

            it('cannot stop() previously stopped processes - Windows', async () => {
                const batchFile = path.join(tempFolder, 'test-script.bat')
                writeBatchFileWithDelays(batchFile)

                const childProcess = new ChildProcess(batchFile)

                // `await` is intentionally not used, we want to check the process while it runs.
                childProcess.run()

                childProcess.stop()
                await waitUntil(
                    async () => {
                        return childProcess.stopped === true
                    },
                    { timeout: 1000, interval: 100 }
                )
                assert.strictEqual(childProcess.stopped, true)
                assert.throws(() => {
                    childProcess.stop()
                })
            })
        } // END Windows-only tests

        if (process.platform !== 'win32') {
            it('detects running processes and successfully stops a running process - Unix', async () => {
                const scriptFile = path.join(tempFolder, 'test-script.sh')
                writeShellFileWithDelays(scriptFile)

                const childProcess = new ChildProcess('sh', {}, scriptFile)

                // `await` is intentionally not used, we want to check the process while it runs.
                childProcess.run()

                assert.strictEqual(childProcess.stopped, false)
                childProcess.stop()
                await waitUntil(
                    async () => {
                        return childProcess.stopped === true
                    },
                    { timeout: 1000, interval: 100 }
                )
                assert.strictEqual(childProcess.stopped, true)
            })

            it('cannot stop() previously stopped processes - Unix', async () => {
                const scriptFile = path.join(tempFolder, 'test-script.sh')
                writeShellFileWithDelays(scriptFile)

                const childProcess = new ChildProcess(scriptFile)

                // `await` is intentionally not used, we want to check the process while it runs.
                childProcess.run()

                childProcess.stop()
                await waitUntil(
                    async () => {
                        return childProcess.stopped === true
                    },
                    { timeout: 1000, interval: 100 }
                )
                assert.strictEqual(childProcess.stopped, true)
                assert.throws(() => {
                    childProcess.stop()
                })
            })
        } // END Unix-only tests
    })

    function writeBatchFile(filename: string): void {
        fs.writeFileSync(filename, '@echo hi')
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

    function writeShellFile(filename: string): void {
        fs.writeFileSync(filename, 'echo hi')
        fs.chmodSync(filename, 0o744)
    }

    function writeShellFileWithDelays(filename: string): void {
        const file = `
        echo hi
        sleep 20
        echo bye`
        fs.writeFileSync(filename, file)
        fs.chmodSync(filename, 0o744)
    }
})
