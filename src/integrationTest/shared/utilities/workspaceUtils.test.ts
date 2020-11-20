/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { writeFile, mkdirp, remove } from 'fs-extra'
import * as path from 'path'
import { ext } from '../../../shared/extensionGlobals'
import * as vscode from 'vscode'
import { findParentProjectFile, getWorkspaceRelativePath } from '../../../shared/utilities/workspaceUtils'
import { getTestWorkspaceFolder } from '../../integrationTestsUtilities'
import { CodelensRootRegistry } from '../../../shared/sam/codelensRootRegistry'

describe('findParentProjectFile', async () => {
    const workspaceDir = getTestWorkspaceFolder()
    let filesToDelete: vscode.Uri[]

    // Save the global registry and restore it after the test
    let globalRegistry: CodelensRootRegistry

    const sourceCodeUri = vscode.Uri.file(path.join(workspaceDir, 'someproject', 'src', 'Program.cs'))
    const projectInSameFolderUri = vscode.Uri.file(path.join(workspaceDir, 'someproject', 'src', 'App.csproj'))
    const projectInParentFolderUri = vscode.Uri.file(path.join(workspaceDir, 'someproject', 'App.csproj'))
    const projectInParentParentFolderUri = vscode.Uri.file(path.join(workspaceDir, 'App.csproj'))
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
    ]

    before(async () => {
        await mkdirp(path.join(workspaceDir, 'someproject', 'src'))
        await mkdirp(path.join(workspaceDir, 'someotherproject'))
        globalRegistry = ext.codelensRootRegistry
    })

    after(async () => {
        remove(path.join(workspaceDir, 'someproject'))
        remove(path.join(workspaceDir, 'someotherproject'))
        ext.codelensRootRegistry = globalRegistry
    })

    beforeEach(() => {
        ext.codelensRootRegistry = new CodelensRootRegistry()
    })

    afterEach(async () => {
        for (const file of filesToDelete) {
            remove(file.fsPath)
        }
        filesToDelete = []
        ext.codelensRootRegistry.dispose()
    })

    testScenarios.forEach(test => {
        it(test.scenario, async () => {
            filesToDelete = test.filesToUse
            for (const file of test.filesToUse) {
                await writeFile(file.fsPath, '')
                // Add it to the registry. The registry is async and we are not
                // testing the registry in this test, so manually use it
                await ext.codelensRootRegistry.addItemToRegistry(file)
            }
            const projectFile = await findParentProjectFile(sourceCodeUri, /^.*\.csproj$/)
            if (test.expectedResult) {
                // doesn't do a deepStrictEqual because VS Code sets a hidden field to `undefined` when returning instead of `null` (when it's created)
                // for all intents and purposes, if this matches, it's good enough for us.
                assert.strictEqual(projectFile?.fsPath, test.expectedResult?.fsPath)
            } else {
                assert.strictEqual(projectFile, test.expectedResult)
            }
        })
    })
})

describe('getWorkspaceRelativePath', () => {
    const parentPath = path.join('/', 'level1', 'level2')
    const nestedPath = path.join(parentPath, 'level3')
    const childPath = path.join(nestedPath, 'level4')

    it('returns a path relative to the first parent path it sees', () => {
        const relativePath = getWorkspaceRelativePath(childPath, {
            workspaceFolders: [
                {
                    index: 0,
                    name: '',
                    uri: vscode.Uri.file(nestedPath),
                },
                {
                    index: 1,
                    name: '',
                    uri: vscode.Uri.file(parentPath),
                },
            ],
        })

        assert.strictEqual(relativePath, 'level4')
    })

    it('returns undefined if no workspace folders exist', () => {
        const relativePath = getWorkspaceRelativePath(childPath, { workspaceFolders: undefined })
        assert.strictEqual(relativePath, undefined)
    })

    it('returns undefined if no paths are parents', () => {
        const relativePath = getWorkspaceRelativePath(childPath, {
            workspaceFolders: [
                {
                    index: 0,
                    name: '',
                    uri: vscode.Uri.file(path.join('different', nestedPath)),
                },
                {
                    index: 1,
                    name: '',
                    uri: vscode.Uri.file(path.join('different', parentPath)),
                },
            ],
        })
        assert.strictEqual(relativePath, undefined)
    })
})
