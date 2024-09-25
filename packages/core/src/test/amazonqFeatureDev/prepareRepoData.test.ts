/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert'
import { WorkspaceFolder } from 'vscode'
import { performanceTest } from '../../shared/performance/performance'
import { createTestWorkspace } from '../testUtil'
import { prepareRepoData, TelemetryHelper } from '../../amazonqFeatureDev'
import { AmazonqCreateUpload, getRandomString, Metric } from '../../shared'

type resultType = {
    zipFileBuffer: Buffer
    zipFileChecksum: string
}

describe('prepareRepoDataPerformanceTest', function () {
    function verifyResult(result: resultType, telemetry: TelemetryHelper, expectedSize: number): void {
        assert.ok(result)
        assert.strictEqual(Buffer.isBuffer(result.zipFileBuffer), true)
        assert.strictEqual(telemetry.repositorySize, expectedSize)
        assert.strictEqual(result.zipFileChecksum.length, 44)
    }

    performanceTest(
        {
            testRuns: 10,
            linux: {
                userCpuUsage: 80,
                heapTotal: 4,
                duration: 1.5,
            },
            darwin: {
                userCpuUsage: 80,
                systemCpuUsage: 35,
                heapTotal: 4,
                duration: 0.9,
            },
            win32: {
                userCpuUsage: 80,
                systemCpuUsage: 35,
                heapTotal: 4,
                duration: 3,
            },
        },
        'handles many files',
        function () {
            const telemetry = new TelemetryHelper()
            let workspace: WorkspaceFolder
            let result: resultType
            return {
                setup: async () => {
                    workspace = await createTestWorkspace(500, {
                        fileNamePrefix: 'file',
                        fileContent: '0123456789',
                        fileNameSuffix: '.md',
                    })
                },
                execute: async () => {
                    result = await prepareRepoData([workspace.uri.fsPath], [workspace], telemetry, {
                        record: () => {},
                    } as unknown as Metric<AmazonqCreateUpload>)
                },
                verify: async () => verifyResult(result, telemetry, 5000),
            }
        }
    )

    performanceTest(
        {
            testRuns: 10,
            linux: {
                userCpuUsage: 65,
                systemCpuUsage: 30,
                heapTotal: 1,
                duration: 0.1,
            },
            darwin: {
                userCpuUsage: 50,
                systemCpuUsage: 25,
                heapTotal: 1,
                duration: 0.2,
            },
            win32: {
                userCpuUsage: 60,
                systemCpuUsage: 30,
                heapTotal: 1,
                duration: 0.1,
            },
        },

        'handles large files',
        function () {
            const telemetry = new TelemetryHelper()
            let result: resultType
            let workspace: WorkspaceFolder
            return {
                setup: async () => {
                    workspace = await createTestWorkspace(10, {
                        fileNamePrefix: 'file',
                        fileContent: getRandomString(1000),
                        fileNameSuffix: '.md',
                    })
                },
                execute: async () => {
                    result = await prepareRepoData([workspace.uri.fsPath], [workspace], telemetry, {
                        record: () => {},
                    } as unknown as Metric<AmazonqCreateUpload>)
                },
                verify: async () => verifyResult(result, telemetry, 10000),
            }
        }
    )
})
