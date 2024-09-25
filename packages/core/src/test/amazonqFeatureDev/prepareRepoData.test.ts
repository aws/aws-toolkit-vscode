/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert'
import { WorkspaceFolder } from 'vscode'
import { performanceTest } from '../../shared/performance/performance'
import { createTestWorkspace } from '../testUtil'
import { prepareRepoData, TelemetryHelper } from '../../amazonqFeatureDev'
import { AmazonqCreateUpload, Metric } from '../../shared'

describe('prepareRepoDataPerformanceTest', function () {
    let fileAmount: number
    let fileNamePrefix: string
    let fileNameSuffix: string
    let fileContent: string
    let workspace: WorkspaceFolder

    beforeEach(async function () {})

    afterEach(async function () {})

    after(async function () {})

    before(async function () {
        fileAmount = 1000
        fileNamePrefix = 'file'
        fileNameSuffix = '.md'
        fileContent = 'test content'

        workspace = await createTestWorkspace(fileAmount, { fileNamePrefix, fileContent, fileNameSuffix })
    })

    performanceTest(
        {
            testRuns: 10,
            linux: {
                userCpuUsage: 80,
                heapTotal: 8,
                duration: 0.7,
            },
            darwin: {
                userCpuUsage: 80,
                heapTotal: 8,
                duration: 0.7,
            },
            win32: {
                userCpuUsage: 80,
                heapTotal: 8,
                duration: 0.7,
            },
        },
        'handles many files',
        function () {
            const telemetry = new TelemetryHelper()
            let result: any
            return {
                setup: async () => {},
                execute: async () => {
                    result = await prepareRepoData([workspace.uri.fsPath], [workspace], telemetry, {
                        record: () => {},
                    } as unknown as Metric<AmazonqCreateUpload>)
                },
                verify: async () => {
                    assert.ok(result)
                    assert.strictEqual(Buffer.isBuffer(result.zipFileBuffer), true)
                    assert.strictEqual(telemetry.repositorySize, 12000)
                    assert.strictEqual(result.zipFileChecksum.length, 44)
                },
            }
        }
    )
})
