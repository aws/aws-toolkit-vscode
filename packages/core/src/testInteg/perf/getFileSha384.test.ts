/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert'
import path from 'path'
import sinon from 'sinon'
import { getTestWorkspaceFolder } from '../integrationTestsUtilities'
import { fs, getRandomString } from '../../shared'
import { LspController } from '../../amazonq'
import { getEqualOSTestOptions, performanceTest } from '../../shared/performance/performance'
import { FileSystem } from '../../shared/fs/fs'
import { getFsCallsUpperBound } from './utilities'

interface SetupResult {
    testFile: string
    fsSpy: sinon.SinonSpiedInstance<FileSystem>
}

function performanceTestWrapper(label: string, fileSize: number) {
    return performanceTest(
        getEqualOSTestOptions({
            userCpuUsage: 400,
            systemCpuUsage: 35,
            heapTotal: 4,
        }),
        label,
        function () {
            return {
                setup: async () => {
                    const workspace = getTestWorkspaceFolder()
                    const fileContent = getRandomString(fileSize)
                    const testFile = path.join(workspace, 'test-file')
                    await fs.writeFile(testFile, fileContent)
                    const fsSpy = sinon.spy(fs)
                    return { testFile, fsSpy }
                },
                execute: async (setup: SetupResult) => {
                    return await LspController.instance.getFileSha384(setup.testFile)
                },
                verify: async (setup: SetupResult, result: string) => {
                    assert.strictEqual(result.length, 96)
                    assert.ok(getFsCallsUpperBound(setup.fsSpy) <= 1, 'makes a single call to fs')
                },
            }
        }
    )
}

describe('getFileSha384', function () {
    describe('performance tests', function () {
        afterEach(function () {
            sinon.restore()
        })
        performanceTestWrapper('1MB', 1000)
        performanceTestWrapper('2MB', 2000)
        performanceTestWrapper('4MB', 4000)
        performanceTestWrapper('8MB', 8000)
    })
})
