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
    /**
     * Tests 250 files w/ 10 bytes each.
     * Running more files can lead to flaky test from timeout.
     */
    performanceTest(
        {
            testRuns: 10,
            linux: {
                userCpuUsage: 90,
                systemCpuUsage: 35,
                heapTotal: 4,
            },
            darwin: {
                userCpuUsage: 90,
                systemCpuUsage: 35,
                heapTotal: 4,
            },
            win32: {
                userCpuUsage: 90,
                systemCpuUsage: 35,
                heapTotal: 4,
            },
        },
        'handles many files',
        function () {
            const telemetry = new TelemetryHelper()
            return {
                setup: async () => {
                    return await createTestWorkspace(250, {
                        fileNamePrefix: 'file',
                        fileContent: '0123456789',
                        fileNameSuffix: '.md',
                    })
                },
                execute: async (workspace: WorkspaceFolder) => {
                    return await prepareRepoData([workspace.uri.fsPath], [workspace], telemetry, {
                        record: () => {},
                    } as unknown as Metric<AmazonqCreateUpload>)
                },
                verify: async (_w: WorkspaceFolder, result: resultType) => verifyResult(result, telemetry, 2500),
            }
        }
    )
    /**
     * Runs 10 files of size 1000 bytes.
     */
    performanceTest(
        {
            testRuns: 10,
            linux: {
                userCpuUsage: 65,
                systemCpuUsage: 30,
                heapTotal: 1,
            },
            darwin: {
                userCpuUsage: 50,
                systemCpuUsage: 25,
                heapTotal: 1,
            },
            win32: {
                userCpuUsage: 60,
                systemCpuUsage: 30,
                heapTotal: 1,
            },
        },

        'handles large files',
        function () {
            const telemetry = new TelemetryHelper()
            return {
                setup: async () => {
                    return await createTestWorkspace(10, {
                        fileNamePrefix: 'file',
                        fileContent: getRandomString(1000),
                        fileNameSuffix: '.md',
                    })
                },
                execute: async (workspace: WorkspaceFolder) => {
                    return await prepareRepoData([workspace.uri.fsPath], [workspace], telemetry, {
                        record: () => {},
                    } as unknown as Metric<AmazonqCreateUpload>)
                },
                verify: async (_w: WorkspaceFolder, result: resultType) => verifyResult(result, telemetry, 10000),
            }
        }
    )
})
