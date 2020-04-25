/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { writeFile } from 'fs-extra'
import * as path from 'path'
import * as vscode from 'vscode'
import { findParentProjectFile } from '../../../shared/utilities/workspaceUtils'
import { getTestWorkspaceFolder } from '../../integrationTestsUtilities'
import { mkdir, rmrf } from '../../../shared/filesystem'

describe('findParentProjectFile', async () => {
    const workspaceDir = getTestWorkspaceFolder()
    let filesToDelete: vscode.Uri[]

    const sourceCodeUri = vscode.Uri.file(path.join(workspaceDir, 'someproject', 'src', 'Program.cs'))
    const projectInSameFolderUri = vscode.Uri.file(path.join(workspaceDir, 'someproject', 'src', 'App.csproj'))
    const projectInParentFolderUri = vscode.Uri.file(path.join(workspaceDir, 'someproject', 'App.csproj'))
    const projectInParentParentFolderUri = vscode.Uri.file(path.join(workspaceDir, 'App.csproj'))
    const projectInParentButOutOfWorkspace = vscode.Uri.file(path.join(workspaceDir, '..', 'App.csproj'))
    const projectOutOfParentChainUri = vscode.Uri.file(path.join(workspaceDir, 'someotherproject', 'App.csproj'))

    const testScenarios = [
        {
            scenario: 'locates project in same folder',
            filesToUse: [projectInSameFolderUri],
            expectedResult: projectInSameFolderUri,
        },
        {
            scenario: 'locates project in parent folder',
            filesToUse: [projectInParentFolderUri],
            expectedResult: projectInParentFolderUri,
        },
        {
            scenario: 'locates project two parent folders up',
            filesToUse: [projectInParentParentFolderUri],
            expectedResult: projectInParentParentFolderUri,
        },
        {
            scenario: 'selects project in same folder over parent folder',
            filesToUse: [projectInSameFolderUri, projectInParentFolderUri],
            expectedResult: projectInSameFolderUri,
        },
        {
            scenario: 'always selects project in same folder over parent folder regardless of order',
            filesToUse: [projectInParentFolderUri, projectInSameFolderUri],
            expectedResult: projectInSameFolderUri,
        },
        {
            scenario: 'returns undefined when no project files are located',
            filesToUse: [],
            expectedResult: undefined,
        },
        {
            scenario: 'returns undefined when no project files are located in parent chain',
            filesToUse: [projectOutOfParentChainUri],
            expectedResult: undefined,
        },
        {
            scenario: 'returns undefined when the project file is in the parent chain but out of the workspace folder',
            filesToUse: [projectInParentButOutOfWorkspace],
            expectedResult: undefined,
        },
    ]

    before(async () => {
        await mkdir(path.join(workspaceDir, 'someproject', 'src'), { recursive: true })
        await mkdir(path.join(workspaceDir, 'someotherproject'))
    })

    after(async () => {
        rmrf(path.join(workspaceDir, 'someproject'))
        rmrf(path.join(workspaceDir, 'someotherproject'))
    })

    afterEach(async () => {
        for (const file of filesToDelete) {
            rmrf(file.fsPath)
        }
        filesToDelete = []
    })

    testScenarios.forEach(test => {
        it(test.scenario, async () => {
            filesToDelete = test.filesToUse
            for (const file of test.filesToUse) {
                await writeFile(file.fsPath, '')
            }
            const projectFile = await findParentProjectFile(sourceCodeUri, '*.csproj')
            if (test.expectedResult) {
                // doesn't do a deepStrictEqual because VS Code sets a hidden field to `undefined` when returning instead of `null` (when it's created)
                // for all intents and purposes, if this matches, it's good enough for us.
                assert.strictEqual(projectFile!.fsPath, test.expectedResult!.fsPath)
            } else {
                assert.strictEqual(projectFile, test.expectedResult)
            }
        })
    })
})
