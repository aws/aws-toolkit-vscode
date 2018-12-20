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
import { SamCliProcess } from '../../../../shared/sam/cli/samCliProcess'

describe('SamCliProcess', async () => {

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

            const samCliProcess = new SamCliProcess(
                batchFile
            )

            samCliProcess.start()

            const result = await samCliProcess.promise()

            assert.equal(result.exitCode, 0)
            assert.equal(result.stdout, 'hi')
        })

        it('errs when starting twice - windows', async () => {
            const batchFile = path.join(tempFolder, 'test-script.bat')
            writeBatchFile(batchFile)

            const samCliProcess = new SamCliProcess(
                batchFile
            )

            samCliProcess.start()

            assert.throws(() => {
                samCliProcess.start()
            })
        })
    }

    if (process.platform !== 'win32') {
        it('runs and captures stdout - unix', async () => {
            const scriptFile = path.join(tempFolder, 'test-script.sh')
            writeShellFile(scriptFile)

            const samCliProcess = new SamCliProcess(
                scriptFile
            )

            samCliProcess.start()

            const result = await samCliProcess.promise()

            assert.equal(result.exitCode, 0)
            assert.equal(result.stdout, 'hi')
        })

        it('errs when starting twice - unix', async () => {
            const scriptFile = path.join(tempFolder, 'test-script.sh')
            writeShellFile(scriptFile)

            const samCliProcess = new SamCliProcess(
                scriptFile
            )

            samCliProcess.start()

            assert.throws(() => {
                samCliProcess.start()
            })
        })
    }

    it('errs when getting promise without starting', async () => {
        const batchFile = path.join(tempFolder, 'test-script.bat')
        writeBatchFile(batchFile)

        const samCliProcess = new SamCliProcess(
            batchFile
        )

        try {
            await samCliProcess.promise()
            assert.equal(true, false, 'error expected')
        } catch (err) {
            assert.notEqual(err, undefined)
        }
    })

    it('reports error for missing executable', async () => {
        const batchFile = path.join(tempFolder, 'nonExistentScript')

        const samCliProcess = new SamCliProcess(
            batchFile
        )

        samCliProcess.start()

        const result = await samCliProcess.promise()

        assert.notEqual(result.exitCode, 0)
        assert.notEqual(result.error, undefined)
    })

    function writeBatchFile(filename: string): void {
        fs.writeFileSync(filename, '@echo hi')
    }

    function writeShellFile(filename: string): void {
        fs.writeFileSync(filename, 'echo hi')
        fs.chmodSync(filename, 0o744)
    }
})
