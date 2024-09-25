/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert'
import { WorkspaceFolder } from 'vscode'
import { getEqualOptions, performanceTest } from '../../shared/performance/performance'
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

    performanceTest(getEqualOptions(10, 80, 8, 0.7), 'handles many files', function () {
        const telemetry = new TelemetryHelper()
        let workspace: WorkspaceFolder
        let result: resultType
        return {
            setup: async () => {
                workspace = await createTestWorkspace(1000, {
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
            verify: async () => verifyResult(result, telemetry, 10000),
        }
    })

    performanceTest(getEqualOptions(10, 30, 1, 0.1), 'handles large files', function () {
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
    })
})
