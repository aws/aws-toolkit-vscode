/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert'
import * as sinon from 'sinon'
import { WorkspaceFolder } from 'vscode'
import { performanceTest } from '../../shared/performance/performance'
import { createTestWorkspace } from '../testUtil'
import { prepareRepoData, TelemetryHelper } from '../../amazonqFeatureDev'
import { AmazonqCreateUpload, fs, getRandomString } from '../../shared'
import { Span } from '../../shared/telemetry'
import { FileSystem } from '../../shared/fs/fs'
import AdmZip from 'adm-zip'

type resultType = {
    zipFileBuffer: Buffer
    zipFileChecksum: string
}

type setupResult = {
    workspace: WorkspaceFolder
    initialZip: AdmZip
    fsSpy: sinon.SinonSpiedInstance<FileSystem>
    zipSpy: sinon.SinonSpiedInstance<AdmZip>
    numFiles: number
    fileSize: number
}

function performanceTestWrapper(numFiles: number, fileSize: number) {
    return performanceTest(
        {
            testRuns: 1,
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
                    const initialZip = new AdmZip()
                    const fsSpy = sinon.spy(fs)
                    const zipSpy = sinon.spy(initialZip)
                    const workspace = await createTestWorkspace(numFiles, {
                        fileNamePrefix: 'file',
                        fileContent: getRandomString(fileSize),
                        fileNameSuffix: '.md',
                    })
                    return { workspace, initialZip, fsSpy, zipSpy, numFiles, fileSize }
                },
                execute: async (setup: setupResult) => {
                    return await prepareRepoData(
                        [setup.workspace.uri.fsPath],
                        [setup.workspace],
                        telemetry,
                        {
                            record: () => {},
                        } as unknown as Span<AmazonqCreateUpload>,
                        setup.initialZip
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

    assert.ok(setup.fsSpy.stat.callCount <= setup.numFiles * 2, 'calls stat at most twice per file')
    // Sometimes this line fails locally when it finds additional. This shouldn't happen in CI.
    assert.ok(setup.fsSpy.readFileText.callCount <= setup.numFiles, 'reads each file at most once')
    assert.ok(setup.zipSpy.addLocalFile.callCount <= setup.numFiles, 'add files to zip at most once')
    assert.strictEqual(setup.zipSpy.toBuffer.callCount, 1, 'creates buffer once')
}

describe('prepareRepoData', function () {
    describe('Performance Tests', function () {
        afterEach(function () {
            sinon.restore()
        })
        performanceTestWrapper(250, 10)
        performanceTestWrapper(10, 1000)
    })
})
