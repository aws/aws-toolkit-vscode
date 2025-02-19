/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert'
import * as vscode from 'vscode'
import * as sinon from 'sinon'
import { getEqualOSTestOptions, performanceTest } from '../../shared/performance/performance'
import { createTestWorkspaceFolder, toFile } from '../../test/testUtil'
import path from 'path'
import { fs, randomUUID } from '../../shared'
import { collectFiles } from '../../shared/utilities/workspaceUtils'
import { getFsCallsUpperBound } from './utilities'
import { FileSystem } from '../../shared/fs/fs'

function performanceTestWrapper(totalFiles: number) {
    return performanceTest(
        getEqualOSTestOptions({
            userCpuUsage: 100,
            systemCpuUsage: 35,
            heapTotal: 2,
        }),
        'calculate cpu and memory usage',
        function () {
            return {
                setup: async () => {
                    const workspace = await createTestWorkspaceFolder()

                    sinon.stub(vscode.workspace, 'workspaceFolders').value([workspace])
                    const fsSpy = sinon.spy(fs)
                    const findFilesSpy = sinon.spy(vscode.workspace, 'findFiles')
                    const fileContent = randomUUID()
                    for (let x = 0; x < totalFiles; x++) {
                        await toFile(fileContent, path.join(workspace.uri.fsPath, `file.${x}`))
                    }

                    return {
                        workspace,
                        fsSpy,
                        findFilesSpy,
                    }
                },
                execute: async ({ workspace }: { workspace: vscode.WorkspaceFolder }) => {
                    return {
                        result: await collectFiles([workspace.uri.fsPath], [workspace]),
                    }
                },
                verify: (
                    setup: {
                        workspace: vscode.WorkspaceFolder
                        fsSpy: sinon.SinonSpiedInstance<FileSystem>
                        findFilesSpy: sinon.SinonSpy
                    },
                    { result }: { result: Awaited<ReturnType<typeof collectFiles>> }
                ) => {
                    assert.deepStrictEqual(result.length, totalFiles)
                    const sortedFiles = [...result].sort((a, b) => {
                        const numA = parseInt(a.relativeFilePath.split('.')[1])
                        const numB = parseInt(b.relativeFilePath.split('.')[1])
                        return numA - numB
                    })
                    for (let x = 0; x < totalFiles; x++) {
                        assert.deepStrictEqual(sortedFiles[x].relativeFilePath, `file.${x}`)
                    }

                    assert.ok(
                        getFsCallsUpperBound(setup.fsSpy) <= totalFiles * 5,
                        'total system calls below 5 per file'
                    )
                    assert.ok(setup.findFilesSpy.callCount <= 2, 'findFiles not called more than twice')
                },
            }
        }
    )
}

describe('collectFiles', function () {
    afterEach(function () {
        sinon.restore()
    })
    performanceTestWrapper(10)
    performanceTestWrapper(100)
    performanceTestWrapper(250)
})
