/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import vscode from 'vscode'
import * as path from 'path'
import sinon from 'sinon'
import assert from 'assert'
import { collectFiles, prepareRepoData } from '../../../amazonqFeatureDev/util/files'
import { createTestWorkspace, createTestWorkspaceFolder, toFile } from '../../testUtil'
import { TelemetryHelper } from '../../../amazonqFeatureDev/util/telemetryHelper'
import { AmazonqCreateUpload, Metric } from '../../../shared/telemetry/telemetry.gen'

describe('file utils', () => {
    describe('collectFiles', function () {
        it('returns all files in the workspace', async function () {
            // these variables are a manual selection of settings for the test in order to test the collectFiles function
            const fileAmount = 2
            const fileNamePrefix = 'file'
            const fileContent = 'test content'

            const workspace = await createTestWorkspace(fileAmount, { fileNamePrefix, fileContent })
            sinon.stub(vscode.workspace, 'workspaceFolders').value([workspace])

            const result = await collectFiles(workspace.uri.fsPath, false)
            assert.strictEqual(result.length, fileAmount)
            for (let i = 0; i < fileAmount; i++) {
                assert.strictEqual(result[i].filePath.includes(fileNamePrefix), true)
                assert.strictEqual(result[i].fileContent, fileContent)
            }
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
            const result = await prepareRepoData(workspace.uri.fsPath, telemetry, {
                record: () => {},
            } as unknown as Metric<AmazonqCreateUpload>)
            assert.strictEqual(Buffer.isBuffer(result.zipFileBuffer), true)
            // checksum is not the same across different test executions because some unique random folder names are generated
            assert.strictEqual(result.zipFileChecksum.length, 44)
            assert.strictEqual(telemetry.repositorySize, 24)
        })
    })

    it('returns all files in the workspace not excluded by gitignore', async function () {
        // these variables are a manual selection of settings for the test in order to test the collectFiles function
        const fileAmount = 3
        const fileNamePrefix = 'file'
        const fileContent = 'test content'

        const workspace = await createTestWorkspace(fileAmount, { fileNamePrefix, fileContent })

        const writeFile = async (pathParts: string[], fileContent: string) => {
            await toFile(fileContent, workspace.uri.fsPath, ...pathParts)
        }

        sinon.stub(vscode.workspace, 'workspaceFolders').value([workspace])
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

        const result = await collectFiles(workspace.uri.fsPath, true)
        result.sort((l, r) => l.filePath.localeCompare(r.filePath))

        // non-posix filePath check here is important.
        assert.deepStrictEqual(
            [
                {
                    filePath: '.gitignore',
                    fileContent: gitignoreContent,
                },
                {
                    filePath: 'file1',
                    fileContent: 'test content',
                },
                {
                    filePath: 'file3',
                    fileContent: 'test content',
                },
                {
                    filePath: 'range_file9',
                    fileContent: 'test content',
                },
                {
                    filePath: path.join('src', '.gitignore'),
                    fileContent: gitignore2,
                },
                {
                    filePath: path.join('src', 'folder2', 'a.js'),
                    fileContent: fileContent,
                },
                {
                    filePath: path.join('src', 'folder3', '.gitignore'),
                    fileContent: gitignore3,
                },
                {
                    filePath: path.join('src', 'folder3', 'negate_test1'),
                    fileContent: fileContent,
                },
            ],
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

        const result = await collectFiles(workspace.uri.fsPath, true)

        assert.deepStrictEqual([], result)
    })
})
