/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as path from 'path'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { findParentProjectFile } from '../../../shared/codelens/codeLensUtils'

describe('findParentProjectFile', async () => {
    before(() => {
        const sandbox = sinon.createSandbox()
        sandbox.stub(vscode.workspace, 'getWorkspaceFolder').returns({
            name: 'tempFolder',
            index: 0,
            uri: vscode.Uri.parse('code'),
        })
    })
    const sourceCodeUri = vscode.Uri.file(path.join('code', 'someproject', 'src', 'Program.cs'))
    const projectInSameFolderUri = vscode.Uri.file(path.join('code', 'someproject', 'src', 'App.csproj'))
    const projectInParentFolderUri = vscode.Uri.file(path.join('code', 'someproject', 'App.csproj'))
    const projectInParentParentFolderUri = vscode.Uri.file(path.join('code', 'App.csproj'))
    const projectOutOfParentChainUri = vscode.Uri.file(path.join('code', 'someotherproject', 'App.csproj'))

    const testScenarios = [
        {
            scenario: 'locates project in same folder',
            findFilesResult: [projectInSameFolderUri],
            expectedResult: projectInSameFolderUri,
        },
        {
            scenario: 'locates project in parent folder',
            findFilesResult: [projectInParentFolderUri],
            expectedResult: projectInParentFolderUri,
        },
        {
            scenario: 'locates project two parent folders up',
            findFilesResult: [projectInParentParentFolderUri],
            expectedResult: projectInParentParentFolderUri,
        },
        {
            scenario: 'selects project in same folder over parent folder',
            findFilesResult: [projectInSameFolderUri, projectInParentFolderUri],
            expectedResult: projectInSameFolderUri,
        },
        {
            scenario: 'always selects project in same folder over parent folder regardless of order',
            findFilesResult: [projectInParentFolderUri, projectInSameFolderUri],
            expectedResult: projectInSameFolderUri,
        },
        {
            scenario: 'returns undefined when no project files are located',
            findFilesResult: [],
            expectedResult: undefined,
        },
        {
            scenario: 'returns undefined when no project files are located in parent chain',
            findFilesResult: [projectOutOfParentChainUri],
            expectedResult: undefined,
        },
    ]

    testScenarios.forEach(test => {
        it(test.scenario, async () => {
            const projectFile = await findParentProjectFile(
                sourceCodeUri,
                path.join('**', '*.csproj'),
                async (): Promise<vscode.Uri[]> => test.findFilesResult
            )
            assert.strictEqual(projectFile, test.expectedResult, 'Project file was not the expected one')
        })
    })
})
