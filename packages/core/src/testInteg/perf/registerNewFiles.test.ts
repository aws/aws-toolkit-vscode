/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert'
import * as vscode from 'vscode'
import { NewFileInfo, NewFileZipContents, registerNewFiles } from '../../amazonqFeatureDev'
import { performanceTest } from '../../shared/performance/performance'
import { getTestWorkspaceFolder } from '../integrationTestsUtilities'
import { VirtualFileSystem } from '../../shared'

interface SetupResult {
    workspace: vscode.WorkspaceFolder
    fileContents: NewFileZipContents[]
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
        {
            testRuns: 10,
            linux: {
                userCpuUsage: 200,
                systemCpuUsage: 35,
                heapTotal: 8,
            },
            darwin: {
                userCpuUsage: 200,
                systemCpuUsage: 35,
                heapTotal: 8,
            },
            win32: {
                userCpuUsage: 200,
                systemCpuUsage: 35,
                heapTotal: 8,
            },
        },
        label,
        function () {
            return {
                setup: async () => {
                    const testWorkspaceUri = vscode.Uri.file(getTestWorkspaceFolder())
                    const fileContents = getFileContents(numFiles, fileSize)
                    return {
                        workspace: {
                            uri: testWorkspaceUri,
                            name: 'test-workspace',
                            index: 0,
                        },
                        fileContents: fileContents,
                    }
                },
                execute: async (setup: SetupResult) => {
                    return registerNewFiles(
                        new VirtualFileSystem(),
                        setup.fileContents,
                        'test-upload-id',
                        [setup.workspace],
                        conversationId
                    )
                },
                verify: async (_setup: SetupResult, result: NewFileInfo[]) => {
                    assert.strictEqual(result.length, numFiles)
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
