/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import * as del from 'del'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { ChildProcess } from '../../shared/utilities/childProcess'

describe('ChildProcess', async () => {

    let tempFolder: string

    beforeEach(() => {
        // Make a temp folder for all these tests
        // Stick some temp credentials files in there to load from
        tempFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'vsctk'))
    })

    afterEach(() => {
        del.sync([tempFolder], { force: true })
    })

    if (process.platform === 'win32') {
        it('runs and captures stdout - windows', async () => {
            const batchFile = path.join(tempFolder, 'test-script.bat')
            writeBatchFile(batchFile)

            const childProcess = new ChildProcess(
                batchFile
            )

            childProcess.start()

            const result = await childProcess.promise()

            assert.strictEqual(result.exitCode, 0, `Expected exit code 0, got ${result.exitCode}`)
            assert.strictEqual(result.stdout, 'hi', `Expected stdout to be hi , got: ${result.stdout}`)
        })

        it('errs when starting twice - windows', async () => {
            const batchFile = path.join(tempFolder, 'test-script.bat')
            writeBatchFile(batchFile)

            const childProcess = new ChildProcess(
                batchFile
            )

            childProcess.start()

            assert.throws(() => {
                childProcess.start()
            })
        })
    } // END Windows only tests

    if (process.platform !== 'win32') {
        it('runs and captures stdout - unix', async () => {
            const scriptFile = path.join(tempFolder, 'test-script.sh')
            writeShellFile(scriptFile)

            const childProcess = new ChildProcess(
                scriptFile
            )

            childProcess.start()

            const result = await childProcess.promise()

            assert.strictEqual(result.exitCode, 0, `Expected exit code 0, got ${result.exitCode}`)
            assert.strictEqual(result.stdout, 'hi', `Expected stdout to be hi , got: ${result.stdout}`)
        })

        it('errs when starting twice - unix', async () => {
            const scriptFile = path.join(tempFolder, 'test-script.sh')
            writeShellFile(scriptFile)

            const childProcess = new ChildProcess(
                scriptFile
            )

            childProcess.start()

            assert.throws(() => {
                childProcess.start()
            })
        })
    } // END Linux only tests

    it('runs commands containing a space', async () => {
        let command: string

        if (process.platform === 'win32') {
            command = path.join(tempFolder, 'test script.bat')
            writeBatchFile(command)
        } else {
            command = path.join(tempFolder, 'test script.sh')
            writeShellFile(command)
        }

        const childProcess = new ChildProcess(
            command
        )

        childProcess.start()

        const result = await childProcess.promise()

        assert.strictEqual(result.exitCode, 0, `Expected exit code 0, got ${result.exitCode}`)
        assert.strictEqual(result.stdout, 'hi', `Expected stdout to be hi , got: ${result.stdout}`)
    })

    it('errs when getting promise without starting', async () => {
        const batchFile = path.join(tempFolder, 'test-script.bat')
        writeBatchFile(batchFile)

        const childProcess = new ChildProcess(
            batchFile
        )

        try {
            await childProcess.promise()
            assert.strictEqual(true, false, 'error expected')
        } catch (err) {
            assert.notStrictEqual(err, undefined)
        }
    })

    it('reports error for missing executable', async () => {
        const batchFile = path.join(tempFolder, 'nonExistentScript')

        const childProcess = new ChildProcess(
            batchFile
        )

        childProcess.start()

        const result = await childProcess.promise()

        assert.notStrictEqual(result.exitCode, 0)
        assert.notStrictEqual(result.error, undefined)
    })

    function writeBatchFile(filename: string): void {
        fs.writeFileSync(filename, '@echo hi')
    }

    function writeShellFile(filename: string): void {
        fs.writeFileSync(filename, 'echo hi')
        fs.chmodSync(filename, 0o744)
    }
})
