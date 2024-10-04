/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert'
import { WorkspaceFolder } from 'vscode'
import { performanceTest } from '../../shared/performance/performance'
import { createTestWorkspace } from '../testUtil'
import { prepareRepoData, TelemetryHelper } from '../../amazonqFeatureDev'
import { AmazonqCreateUpload, getRandomString } from '../../shared'
import { Span } from '../../shared/telemetry'

type resultType = {
    zipFileBuffer: Buffer
    zipFileChecksum: string
}

function performanceTestWrapper(numFiles: number, fileSize: number) {
    return performanceTest(
        {
            testRuns: 10,
            linux: {
                userCpuUsage: 100,
                systemCpuUsage: 35,
                heapTotal: 4,
            },
            darwin: {
                userCpuUsage: 100,
                systemCpuUsage: 35,
                heapTotal: 4,
            },
            win32: {
                userCpuUsage: 100,
                systemCpuUsage: 35,
                heapTotal: 4,
            },
        },
        `handles ${numFiles} files of size ${fileSize} bytes`,
        function () {
            const telemetry = new TelemetryHelper()
            return {
                setup: async () => {
                    return await createTestWorkspace(numFiles, {
                        fileNamePrefix: 'file',
                        fileContent: getRandomString(fileSize),
                        fileNameSuffix: '.md',
                    })
                },
                execute: async (workspace: WorkspaceFolder) => {
                    return await prepareRepoData([workspace.uri.fsPath], [workspace], telemetry, {
                        record: () => {},
                    } as unknown as Span<AmazonqCreateUpload>)
                },
                verify: async (_w: WorkspaceFolder, result: resultType) => {
                    verifyResult(result, telemetry, numFiles * fileSize)
                },
            }
        }
    )
}

function verifyResult(result: resultType, telemetry: TelemetryHelper, expectedSize: number): void {
    assert.ok(result)
    assert.strictEqual(Buffer.isBuffer(result.zipFileBuffer), true)
    assert.strictEqual(telemetry.repositorySize, expectedSize)
    assert.strictEqual(result.zipFileChecksum.length, 44)
}

describe('prepareRepoData', function () {
    describe('Performance Tests', function () {
        performanceTestWrapper(250, 10)
        performanceTestWrapper(10, 1000)
    })
})
