/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { TestFolder } from '../../testUtil'
import { detectSamProjects, getFiles } from '../../../awsService/appBuilder/explorer/detectSamProjects'
import assert from 'assert'
import * as sinon from 'sinon'

import path from 'path'
import { ToolkitError } from '../../../shared'
import { assertLogsContain } from '../../globalSetup.test'

describe('detectSamProjects', () => {
    let sandbox: sinon.SinonSandbox

    beforeEach(async () => {
        sandbox = sinon.createSandbox()
    })

    afterEach(async () => {
        sandbox.restore()
    })

    it('should return an empty array when no project found', async () => {
        const testFolder = await TestFolder.create()
        sandbox.stub(vscode.workspace, 'workspaceFolders').value([
            {
                index: 0,
                name: 'test-workspace-folder',
                uri: testFolder,
            },
        ])
        const projects = await detectSamProjects()
        assert.strictEqual(projects.length, 0)
    })

    it('should return an empty array when (unlikely) workspace folders is undefined', async () => {
        sandbox.stub(vscode.workspace, 'workspaceFolders').value(undefined)
        const projects = await detectSamProjects()
        assert.strictEqual(projects.length, 0)
    })

    it('should return an non empty array and test projects in testFixture', async () => {
        const projects = await detectSamProjects()
        assert(projects.length >= 20)
        assert(
            projects.some((p) => {
                const projectRootName = path.relative(p.workspaceFolder.uri.fsPath, p.projectRoot.fsPath)
                return projectRootName === 'appbuilder-test-app'
            })
        )
    })
})

describe('getFiles', () => {
    let workspaceFolder: vscode.WorkspaceFolder

    beforeEach(() => {
        const workspaceFolders = vscode.workspace.workspaceFolders
        assert(workspaceFolders)
        workspaceFolder = workspaceFolders[0]
    })

    it('should return an array of one project folder matching pattern without excluded pattern', async () => {
        const templateFiles = await getFiles(workspaceFolder, '**/appbuilder-test-app/template.{yml,yaml}')
        assert.strictEqual(templateFiles.length, 1)
        assert(templateFiles[0].fsPath.endsWith(path.join('appbuilder-test-app', 'template.yaml')))
    })

    it('should return a non empty array contains all project except the excluded pattern', async () => {
        const allTemplateFiles = await getFiles(workspaceFolder, '**/template.{yml,yaml}')
        const templateFiles = await getFiles(workspaceFolder, '**/template.{yml,yaml}', '**/appbuilder-test-app/**')

        assert.strictEqual(allTemplateFiles.length - templateFiles.length, 1)
        assert(!templateFiles.some((f) => f.fsPath.endsWith(path.join('appbuilder-test-app', 'template.yaml'))))
    })

    it('should return empty array given any error', async () => {
        const sandbox = sinon.createSandbox()
        sandbox.stub(vscode.workspace, 'findFiles').rejects(new ToolkitError('mock an unlikely error'))

        const templateFiles = await getFiles(workspaceFolder, '**/template.{yml,yaml}', '**/.aws-sam/**')
        assert.strictEqual(templateFiles.length, 0)
        assertLogsContain('Failed to get files with pattern', false, 'error')
        sandbox.restore()
    })
})
