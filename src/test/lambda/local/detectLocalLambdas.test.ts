/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import * as del from 'del'
import * as path from 'path'
import { Uri, WorkspaceFolder } from 'vscode'
import { detectLocalLambdas } from '../../../lambda/local/detectLocalLambdas'
import { createTemporaryDirectory, createWorkspaceFolder, saveTemplate } from './util'

describe('detectLocalLambdas', () => {
    const workspacePaths: string[] = []
    const workspaceFolders: WorkspaceFolder[] = []

    beforeEach(async () => {
        const { workspacePath, workspaceFolder } = await createWorkspaceFolder('vsctk')

        workspacePaths.push(workspacePath)
        workspaceFolders.push(workspaceFolder)
    })

    afterEach(async () => {
        await del(workspacePaths, { force: true })

        workspacePaths.length = 0
        workspaceFolders.length = 0
    })

    it('detects no lambdas when workspaceFolders is undefined', async () => {
        const actual = await detectLocalLambdas(undefined)

        assert.ok(actual)
        assert.equal(actual.length, 0)
    })

    it('detects no lambdas when workspaceFolders is empty', async () => {
        const actual = await detectLocalLambdas([])

        assert.ok(actual)
        assert.equal(actual.length, 0)
    })

    it('detects no lambdas when template.y[a]ml does not exist', async () => {
        const actual = await detectLocalLambdas(workspaceFolders)

        assert.ok(actual)
        assert.equal(actual.length, 0)
    })

    it('detects no lambdas when template.y[a]ml is empty', async () => {
        await saveTemplate(path.join(workspaceFolders[0].uri.fsPath, 'template.yml'), 'nodejs8.10')
        const actual = await detectLocalLambdas(workspaceFolders)

        assert.ok(actual)
        assert.equal(actual.length, 0)
    })

    it('detects lambdas when template.yml exists', async () => {
        const templatePath = path.join(workspaceFolders[0].uri.fsPath, 'template.yml')
        await saveTemplate(templatePath, 'nodejs8.10', 'MyFunction')
        const actual = await detectLocalLambdas(workspaceFolders)

        assert.ok(actual)
        assert.equal(actual.length, 1)

        const lambda = actual[0]
        assert.ok(lambda)
        assert.equal(lambda.lambda, 'MyFunction')
        assert.equal(lambda.protocol, 'inspector')
        assert.equal(lambda.workspaceFolder.uri.fsPath, workspaceFolders[0].uri.fsPath)
        assert.equal(lambda.templatePath, templatePath)
    })

    it('detects lambdas when template.yaml exists', async () => {
        const templatePath = path.join(workspaceFolders[0].uri.fsPath, 'template.yaml')
        await saveTemplate(templatePath, 'nodejs8.10', 'MyFunction')
        const actual = await detectLocalLambdas(workspaceFolders)

        assert.ok(actual)
        assert.equal(actual.length, 1)
        assert.ok(actual[0])
        assert.equal(actual[0].lambda, 'MyFunction')
        assert.equal(actual[0].templatePath, templatePath)
    })

    it('detects lambdas in multi-folder workspace', async () => {
        assert.equal(workspacePaths.length, 1)

        workspacePaths.push(await createTemporaryDirectory('vsctk2'))
        workspaceFolders.push({
            uri: Uri.file(workspacePaths[1]),
            name: path.basename(workspacePaths[1]),
            index: 1
        })

        const templatePath1 = path.join(workspaceFolders[0].uri.fsPath, 'template.yaml')
        const templatePath2 = path.join(workspaceFolders[1].uri.fsPath, 'template.yml')

        await saveTemplate(templatePath1, 'nodejs8.10', 'MyFunction1')
        await saveTemplate(templatePath2, 'nodejs8.10', 'MyFunction2')
        const actual = await detectLocalLambdas(workspaceFolders)

        assert.ok(actual)
        assert.equal(actual.length, 2)
        assert.ok(actual[0])
        assert.equal(actual[0].lambda, 'MyFunction1')
        assert.equal(actual[0].templatePath, templatePath1)
        assert.ok(actual[1])
        assert.equal(actual[1].lambda, 'MyFunction2')
        assert.equal(actual[1].templatePath, templatePath2)
    })

    it('uses the inspector protocol for nodejs8.10', async () => {
        const templatePath = path.join(workspaceFolders[0].uri.fsPath, 'template.yaml')
        await saveTemplate(templatePath, 'nodejs8.10', 'MyFunction')
        const actual = await detectLocalLambdas(workspaceFolders)

        assert.ok(actual)
        assert.equal(actual.length, 1)

        const lambda = actual[0]
        assert.ok(lambda)
        assert.equal(lambda.protocol, 'inspector')
    })

    it('uses the legacy protocol for nodejs6.10', async () => {
        const templatePath = path.join(workspaceFolders[0].uri.fsPath, 'template.yaml')
        await saveTemplate(templatePath, 'nodejs6.10', 'MyFunction')
        const actual = await detectLocalLambdas(workspaceFolders)

        assert.ok(actual)
        assert.equal(actual.length, 1)

        const lambda = actual[0]
        assert.ok(lambda)
        assert.equal(lambda.protocol, 'legacy')
    })

    it('uses the legacy protocol for nodejs4.3', async () => {
        const templatePath = path.join(workspaceFolders[0].uri.fsPath, 'template.yaml')
        await saveTemplate(templatePath, 'nodejs4.3', 'MyFunction')
        const actual = await detectLocalLambdas(workspaceFolders)

        assert.ok(actual)
        assert.equal(actual.length, 1)

        const lambda = actual[0]
        assert.ok(lambda)
        assert.equal(lambda.protocol, 'legacy')
    })

    it('defaults to the inspector protocol when the runtime version cannot be determined', async () => {
        const templatePath = path.join(workspaceFolders[0].uri.fsPath, 'template.yaml')
        await saveTemplate(templatePath, 'nodejsX.Y', 'MyFunction')
        const actual = await detectLocalLambdas(workspaceFolders)

        assert.ok(actual)
        assert.equal(actual.length, 1)

        const lambda = actual[0]
        assert.ok(lambda)
        assert.equal(lambda.protocol, 'inspector')
    })
})
