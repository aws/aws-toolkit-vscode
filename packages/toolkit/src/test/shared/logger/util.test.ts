/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs-extra'
import * as path from 'path'
import assert from 'assert'
import { makeTemporaryToolkitFolder } from '../../../shared/filesystemUtilities'
import { cleanLogFiles } from '../../../shared/logger/util'

describe('cleanLogFiles', function () {
    let logDir: string
    const testParameters = {
        maxLogs: 5,
        maxFileSize: 100,
        maxKeptLogs: 4,
        minKeptLogs: 2,
    }

    beforeEach(async function () {
        logDir = await makeTemporaryToolkitFolder()
    })

    afterEach(async function () {
        await fs.remove(logDir)
    })

    const makeLogName = (id: number) => `log-${id}.log`
    const createNames = (count: number) =>
        Array(count)
            .fill(0)
            .map((_, i) => makeLogName(i))
    async function populate(names: string[], content: string = '') {
        await Promise.all(names.map(f => fs.writeFile(path.join(logDir, f), content)))
    }

    async function assertLogs(expected: string[]) {
        const logs = await fs.readdir(logDir)
        assert.strictEqual(logs.length, expected.length)
        logs.sort().forEach((f, i) => assert.strictEqual(f, expected[i]))
    }

    it('keeps logs if not at the max', async function () {
        const names = createNames(testParameters.maxKeptLogs)
        await populate(names)
        await cleanLogFiles(logDir, testParameters)
        await assertLogs(createNames(testParameters.maxKeptLogs))
    })

    it("cleans up old logs when there's too many", async function () {
        const count = testParameters.maxLogs + 1
        const names = createNames(count)
        await populate(names)
        await cleanLogFiles(logDir, testParameters)
        await assertLogs(names.slice(count - testParameters.maxKeptLogs))
    })

    it("deletes logs if they're too big", async function () {
        const names = createNames(2)
        await populate([names[0]], Buffer.alloc(testParameters.maxFileSize + 1).toString())
        await populate([names[1]])
        await cleanLogFiles(logDir, testParameters)
        await assertLogs(names.slice(1))
    })

    it('deletes logs down to the minimum for big directories', async function () {
        const names = createNames(5)
        await populate(names, Buffer.alloc(25).toString())
        await cleanLogFiles(logDir, testParameters)
        await assertLogs(names.slice(3))
    })
})
