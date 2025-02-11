/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert'
import sinon from 'sinon'
import * as vscode from 'vscode'
import { featureDevScheme } from '../../amazonqFeatureDev'
import { getEqualOSTestOptions, performanceTest } from '../../shared/performance/performance'
import { getTestWorkspaceFolder } from '../integrationTestsUtilities'
import { VirtualFileSystem } from '../../shared'
import { registerNewFiles } from '../../amazonq/util/files'
import { NewFileInfo, NewFileZipContents } from '../../amazonq'

interface SetupResult {
    workspace: vscode.WorkspaceFolder
    fileContents: NewFileZipContents[]
    vfsSpy: sinon.SinonSpiedInstance<VirtualFileSystem>
    vfs: VirtualFileSystem
}

function getFileContents(numFiles: number, fileSize: number): NewFileZipContents[] {
    return Array.from({ length: numFiles }, (_, i) => {
        return {
            zipFilePath: `test-path-${i}`,
            fileContent: 'x'.repeat(fileSize),
        }
    })
}

function performanceTestWrapper(label: string, numFiles: number, fileSize: number) {
    const conversationId = 'test-conversation'
    return performanceTest(
        getEqualOSTestOptions({
            userCpuUsage: 300,
            systemCpuUsage: 35,
            heapTotal: 20,
        }),
        label,
        function () {
            return {
                setup: async () => {
                    const testWorkspaceUri = vscode.Uri.file(getTestWorkspaceFolder())
                    const fileContents = getFileContents(numFiles, fileSize)
                    const vfs = new VirtualFileSystem()
                    const vfsSpy = sinon.spy(vfs)

                    return {
                        workspace: {
                            uri: testWorkspaceUri,
                            name: 'test-workspace',
                            index: 0,
                        },
                        fileContents: fileContents,
                        vfsSpy: vfsSpy,
                        vfs: vfs,
                    }
                },
                execute: async (setup: SetupResult) => {
                    return registerNewFiles(
                        setup.vfs,
                        setup.fileContents,
                        'test-upload-id',
                        [setup.workspace],
                        conversationId,
                        featureDevScheme
                    )
                },
                verify: async (setup: SetupResult, result: NewFileInfo[]) => {
                    assert.strictEqual(result.length, numFiles)
                    assert.ok(
                        setup.vfsSpy.registerProvider.callCount <= numFiles,
                        'only register each file once in vfs'
                    )
                },
            }
        }
    )
}

describe('registerNewFiles', function () {
    describe('performance tests', function () {
        performanceTestWrapper('1x10MB', 1, 10000)
        performanceTestWrapper('10x1000B', 10, 1000)
        performanceTestWrapper('100x100B', 100, 100)
        performanceTestWrapper('1000x10B', 1000, 10)
        performanceTestWrapper('10000x1B', 10000, 1)
    })
})
