/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert'
import * as sinon from 'sinon'
import { WorkspaceFolder } from 'vscode'
import { getEqualOSTestOptions, performanceTest } from '../../shared/performance/performance'
import { createTestWorkspace } from '../../test/testUtil'
import { prepareRepoData, TelemetryHelper } from '../../amazonqFeatureDev'
import { AmazonqCreateUpload, fs, getRandomString } from '../../shared'
import { Span } from '../../shared/telemetry'
import { FileSystem } from '../../shared/fs/fs'
import { getFsCallsUpperBound } from './utilities'

type resultType = {
    zipFileBuffer: Buffer
    zipFileChecksum: string
}

type setupResult = {
    workspace: WorkspaceFolder
    fsSpy: sinon.SinonSpiedInstance<FileSystem>
    numFiles: number
    fileSize: number
}

function performanceTestWrapper(numFiles: number, fileSize: number) {
    return performanceTest(
        getEqualOSTestOptions({
            userCpuUsage: 200,
            systemCpuUsage: 35,
            heapTotal: 20,
        }),
        `handles ${numFiles} files of size ${fileSize} bytes`,
        function () {
            const telemetry = new TelemetryHelper()
            return {
                setup: async () => {
                    const fsSpy = sinon.spy(fs)
                    const workspace = await createTestWorkspace(numFiles, {
                        fileNamePrefix: 'file',
                        fileContent: getRandomString(fileSize),
                        fileNameSuffix: '.md',
                    })
                    return { workspace, fsSpy, numFiles, fileSize }
                },
                execute: async (setup: setupResult) => {
                    return await prepareRepoData(
                        [setup.workspace.uri.fsPath],
                        [setup.workspace],
                        {
                            record: () => {},
                        } as unknown as Span<AmazonqCreateUpload>,
                        { telemetry }
                    )
                },
                verify: async (setup: setupResult, result: resultType) => {
                    verifyResult(setup, result, telemetry, numFiles * fileSize)
                },
            }
        }
    )
}

function verifyResult(setup: setupResult, result: resultType, telemetry: TelemetryHelper, expectedSize: number): void {
    assert.ok(result)
    assert.strictEqual(Buffer.isBuffer(result.zipFileBuffer), true)
    assert.strictEqual(telemetry.repositorySize, expectedSize)
    assert.strictEqual(result.zipFileChecksum.length, 44)
    assert.ok(getFsCallsUpperBound(setup.fsSpy) <= setup.numFiles * 8, 'total system calls should be under 8 per file')
}

describe('prepareRepoData', function () {
    describe('Performance Tests', function () {
        afterEach(function () {
            sinon.restore()
        })
        performanceTestWrapper(10, 1000)
        performanceTestWrapper(50, 500)
        performanceTestWrapper(100, 100)
        performanceTestWrapper(250, 10)
    })
})
