/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'
import sinon from 'sinon'
import assert from 'assert'
import { collectFiles, getWorkspaceFoldersByPrefixes, prepareRepoData } from '../../../amazonqFeatureDev/util/files'
import { createTestWorkspace, createTestWorkspaceFolder, toFile } from '../../testUtil'
import { TelemetryHelper } from '../../../amazonqFeatureDev/util/telemetryHelper'
import { AmazonqCreateUpload, Metric } from '../../../shared/telemetry/telemetry'

describe('file utils', () => {
    describe('collectFiles', function () {
        it('returns all files in the workspace', async function () {
            // these variables are a manual selection of settings for the test in order to test the collectFiles function
            const workspaceFolders = [
                { fileAmount: 2, fileNamePrefix: 'file', fileContent: 'test content', workspaceName: 'app' },
                { fileAmount: 2, fileNamePrefix: 'file', fileContent: 'test content', workspaceName: 'test' },
            ] satisfies (Parameters<typeof createTestWorkspace>[1] & { fileAmount: number })[]

            const workspaces: [vscode.WorkspaceFolder, vscode.WorkspaceFolder] = [
                await createTestWorkspace(workspaceFolders[0].fileAmount, workspaceFolders[0]),
                await createTestWorkspace(workspaceFolders[1].fileAmount, workspaceFolders[1]),
            ]
            sinon.stub(vscode.workspace, 'workspaceFolders').value(workspaces)

            const result = await collectFiles(
                workspaces.map(ws => ws.uri.fsPath),
                workspaces,
                false
            )
            assert.strictEqual(
                result.length,
                workspaceFolders.reduce((sum, ws) => sum + ws.fileAmount, 0)
            )
            let currentIndex = 0
            for (const workspaceFolder of workspaceFolders) {
                for (let i = currentIndex; i < currentIndex + workspaceFolder.fileAmount; i++) {
                    assert.strictEqual(result[i].relativeFilePath.includes(workspaceFolder.fileNamePrefix), true)
                    assert.strictEqual(result[i].zipFilePath.startsWith(workspaceFolder.workspaceName), true)
                    assert.strictEqual(result[i].fileContent, workspaceFolder.fileContent)
                }
                currentIndex += workspaceFolder.fileAmount
            }
        })

        it('returns all files in the workspace not excluded by gitignore', async function () {
            // these variables are a manual selection of settings for the test in order to test the collectFiles function
            const fileAmount = 3
            const fileNamePrefix = 'file'
            const fileContent = 'test content'

            const workspaceFolder = await createTestWorkspace(fileAmount, { fileNamePrefix, fileContent })

            const writeFile = (pathParts: string[], fileContent: string) => {
                return toFile(fileContent, workspaceFolder.uri.fsPath, ...pathParts)
            }

            sinon.stub(vscode.workspace, 'workspaceFolders').value([workspaceFolder])
            const gitignoreContent = `file2
            # different formats of prefixes
            /build
            node_modules
    
            #some comment
    
            range_file[0-5]
            `
            await writeFile(['.gitignore'], gitignoreContent)

            await writeFile(['build', `ignored1`], fileContent)
            await writeFile(['build', `ignored2`], fileContent)

            await writeFile(['node_modules', `ignored1`], fileContent)
            await writeFile(['node_modules', `ignored2`], fileContent)

            await writeFile([`range_file0`], fileContent)
            await writeFile([`range_file9`], fileContent)

            const gitignore2 = 'folder1\n'
            await writeFile(['src', '.gitignore'], gitignore2)
            await writeFile(['src', 'folder2', 'a.js'], fileContent)

            const gitignore3 = `negate_test*
            !negate_test[0-5]`
            await writeFile(['src', 'folder3', '.gitignore'], gitignore3)
            await writeFile(['src', 'folder3', 'negate_test1'], fileContent)
            await writeFile(['src', 'folder3', 'negate_test6'], fileContent)

            const result = (await collectFiles([workspaceFolder.uri.fsPath], [workspaceFolder], true))
                // for some reason, uri created inline differ in subfields, so skipping them from assertion
                .map(({ fileUri, zipFilePath, ...r }) => ({ ...r }))

            result.sort((l, r) => l.relativeFilePath.localeCompare(r.relativeFilePath))

            // non-posix filePath check here is important.
            assert.deepStrictEqual(
                [
                    {
                        workspaceFolder,
                        relativeFilePath: '.gitignore',
                        fileContent: gitignoreContent,
                    },
                    {
                        workspaceFolder,
                        relativeFilePath: 'file1',
                        fileContent: 'test content',
                    },
                    {
                        workspaceFolder,
                        relativeFilePath: 'file3',
                        fileContent: 'test content',
                    },
                    {
                        workspaceFolder,
                        relativeFilePath: 'range_file9',
                        fileContent: 'test content',
                    },
                    {
                        workspaceFolder,
                        relativeFilePath: path.join('src', '.gitignore'),
                        fileContent: gitignore2,
                    },
                    {
                        workspaceFolder,
                        relativeFilePath: path.join('src', 'folder2', 'a.js'),
                        fileContent: fileContent,
                    },
                    {
                        workspaceFolder,
                        relativeFilePath: path.join('src', 'folder3', '.gitignore'),
                        fileContent: gitignore3,
                    },
                    {
                        workspaceFolder,
                        relativeFilePath: path.join('src', 'folder3', 'negate_test1'),
                        fileContent: fileContent,
                    },
                ] satisfies typeof result,
                result
            )
        })

        it('does not return license files', async function () {
            const workspace = await createTestWorkspaceFolder()

            sinon.stub(vscode.workspace, 'workspaceFolders').value([workspace])

            const fileContent = ''
            for (const fmt of ['txt', 'md']) {
                // root license files
                await toFile(fileContent, workspace.uri.fsPath, `license.${fmt}`)
                await toFile(fileContent, workspace.uri.fsPath, `License.${fmt}`)
                await toFile(fileContent, workspace.uri.fsPath, `LICENSE.${fmt}`)

                // nested license files
                await toFile(fileContent, workspace.uri.fsPath, 'src', `license.${fmt}`)
                await toFile(fileContent, workspace.uri.fsPath, 'src', `License.${fmt}`)
                await toFile(fileContent, workspace.uri.fsPath, 'src', `LICENSE.${fmt}`)
            }

            // add a non license file too, to make sure it is returned
            await toFile(fileContent, workspace.uri.fsPath, 'non-license.md')

            const result = await collectFiles([workspace.uri.fsPath], [workspace], true)

            assert.deepStrictEqual(1, result.length)
            assert.deepStrictEqual('non-license.md', result[0].relativeFilePath)
        })
    })

    describe('prepareRepoData', function () {
        it('returns files in the workspace as a zip', async function () {
            // these variables are a manual selection of settings for the test in order to test the collectFiles function
            const fileAmount = 2
            const fileNamePrefix = 'file'
            const fileContent = 'test content'

            const workspace = await createTestWorkspace(fileAmount, { fileNamePrefix, fileContent })

            const telemetry = new TelemetryHelper()
            const result = await prepareRepoData([workspace.uri.fsPath], [workspace], telemetry, {
                record: () => {},
            } as unknown as Metric<AmazonqCreateUpload>)
            assert.strictEqual(Buffer.isBuffer(result.zipFileBuffer), true)
            // checksum is not the same across different test executions because some unique random folder names are generated
            assert.strictEqual(result.zipFileChecksum.length, 44)
            assert.strictEqual(telemetry.repositorySize, 24)
        })
    })

    describe('getWorkspaceFoldersByPrefixes', function () {
        it('returns undefined for single workspace folder', async () => {
            const result = getWorkspaceFoldersByPrefixes([await createTestWorkspace(1, {})])
            assert.strictEqual(result, undefined)
        })
        it('prefixes folders based on their name if possible', async () => {
            const ws1 = await createTestWorkspace(1, { fileNamePrefix: 'ws1', workspaceName: 'test' })
            const ws2 = await createTestWorkspace(1, { fileNamePrefix: 'ws2', workspaceName: 'app' })
            const result = getWorkspaceFoldersByPrefixes([ws1, ws2])
            assert.deepStrictEqual(result, { test: ws1, app: ws2 })
        })

        it('prefixes folders based on their folder parts, if the names collide', async () => {
            const ws1 = await createTestWorkspace(1, {
                fileNamePrefix: 'ws1',
                workspaceName: 'cdk',
                subDir: 'test/app/cdk',
            })
            const ws2 = await createTestWorkspace(1, {
                fileNamePrefix: 'ws2',
                workspaceName: 'cdk',
                subDir: 'canary/app/cdk',
            })
            const result = getWorkspaceFoldersByPrefixes([ws1, ws2])
            assert.deepStrictEqual(result, { test_app_cdk_cdk: ws1, canary_app_cdk_cdk: ws2 })
        })

        it('when a folder collides with another one in prefixing, it will get the shorter prefix if there are no contenders', async () => {
            const ws1 = await createTestWorkspace(1, {
                fileNamePrefix: 'ws1',
                workspaceName: 'cdk',
                subDir: 'test/app/cdk',
            })
            const ws2 = await createTestWorkspace(1, {
                fileNamePrefix: 'ws2',
                workspaceName: 'cdk',
                subDir: ws1.uri.fsPath,
            })
            const result = getWorkspaceFoldersByPrefixes([ws1, ws2])
            const keys = Object.keys(result ?? {})
            assert.strictEqual(keys.length, 2)
            const keyForWs1 = result?.[keys[0]] === ws1 ? keys[0] : keys[1]
            const keyForWs2 = keyForWs1 === keys[0] ? keys[1] : keys[0]
            assert.strictEqual(keyForWs2.includes(keyForWs1), true)
            assert.strictEqual(keyForWs2.length > keyForWs1.length, true)
        })

        it('when 2 folders collide, they will get suffixed', async () => {
            // the first 2 collide all the way
            const ws1 = await createTestWorkspace(1, {
                fileNamePrefix: 'ws1',
                workspaceName: 'cdk_ws',
                subDir: 'test/app',
            })
            const newRoot = path.join(ws1.uri.fsPath, '../app_cdk')
            await fs.promises.mkdir(newRoot, { recursive: true })
            const ws2: vscode.WorkspaceFolder = {
                index: 0,
                uri: vscode.Uri.file(newRoot),
                name: 'ws',
            }
            const ws3 = await createTestWorkspace(1, {
                fileNamePrefix: 'ws2',
                workspaceName: 'cdk_ws',
                subDir: 'test/zz1',
            })
            const ws4 = await createTestWorkspace(1, {
                fileNamePrefix: 'ws2',
                workspaceName: 'ws',
                subDir: 'test/zz2',
            })
            const result = getWorkspaceFoldersByPrefixes([ws1, ws2, ws3, ws4])
            const keys = Object.keys(result ?? {})
            assert.strictEqual(keys.length, 4)
            const orderedKeys = keys.sort()
            assert.strictEqual(orderedKeys[0].length, orderedKeys[1].length)
            assert.strictEqual(orderedKeys[0].substring(orderedKeys[0].length - 2), '_1')
            assert.strictEqual(orderedKeys[1].substring(orderedKeys[1].length - 2), '_2')
            assert.strictEqual(
                orderedKeys[0].substring(0, orderedKeys[0].length - 2),
                orderedKeys[1].substring(0, orderedKeys[1].length - 2)
            )
        })
    })
})
