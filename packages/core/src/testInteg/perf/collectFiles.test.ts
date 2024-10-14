/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert'
import * as vscode from 'vscode'
import * as sinon from 'sinon'
import { performanceTest } from '../../shared/performance/performance'
import { createTestWorkspaceFolder, toFile } from '../../test/testUtil'
import path from 'path'
import { randomUUID } from '../../shared'
import { collectFiles } from '../../shared/utilities/workspaceUtils'

performanceTest(
    // collecting all files in the workspace and zipping them is pretty resource intensive
    {
        linux: {
            userCpuUsage: 85,
            heapTotal: 2,
            duration: 0.8,
        },
    },
    'calculate cpu and memory usage',
    function () {
        const totalFiles = 100
        return {
            setup: async () => {
                const workspace = await createTestWorkspaceFolder()

                sinon.stub(vscode.workspace, 'workspaceFolders').value([workspace])

                const fileContent = randomUUID()
                for (let x = 0; x < totalFiles; x++) {
                    await toFile(fileContent, path.join(workspace.uri.fsPath, `file.${x}`))
                }

                return {
                    workspace,
                }
            },
            execute: async ({ workspace }: { workspace: vscode.WorkspaceFolder }) => {
                return {
                    result: await collectFiles([workspace.uri.fsPath], [workspace], true),
                }
            },
            verify: (
                _: { workspace: vscode.WorkspaceFolder },
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
            },
        }
    }
)
