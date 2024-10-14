/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert'
import path from 'path'
import { getTestWorkspaceFolder } from '../integrationTestsUtilities'
import { fs, getRandomString } from '../../shared'
import { LspController } from '../../amazonq'
import { performanceTest } from '../../shared/performance/performance'

function performanceTestWrapper(label: string, fileSize: number) {
    return performanceTest(
        {
            testRuns: 1,
            linux: {
                userCpuUsage: 400,
                systemCpuUsage: 35,
                heapTotal: 4,
            },
            darwin: {
                userCpuUsage: 400,
                systemCpuUsage: 35,
                heapTotal: 4,
            },
            win32: {
                userCpuUsage: 400,
                systemCpuUsage: 35,
                heapTotal: 4,
            },
        },
        label,
        function () {
            return {
                setup: async () => {
                    const workspace = getTestWorkspaceFolder()
                    const fileContent = getRandomString(fileSize)
                    const testFile = path.join(workspace, 'test-file')
                    await fs.writeFile(testFile, fileContent)

                    return testFile
                },
                execute: async (testFile: string) => {
                    return await LspController.instance.getFileSha384(testFile)
                },
                verify: async (_testFile: string, result: string) => {
                    assert.strictEqual(result.length, 96)
                },
            }
        }
    )
}

describe('getFileSha384', function () {
    describe('performance tests', function () {
        performanceTestWrapper('1MB', 1000)
        performanceTestWrapper('2MB', 2000)
        performanceTestWrapper('4MB', 4000)
        performanceTestWrapper('8MB', 8000)
    })
})
