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
import { createTemporaryDirectory, saveTemplate } from './util'

suite('detectLocalLambdas tests', () => {
    test('detects no lambdas when workspaceFolders is undefined', async () => {
        const actual = await detectLocalLambdas(undefined)

        assert.ok(actual)
        assert.equal(actual.length, 0)
    })

    test('detects no lambdas when workspaceFolders is empty', async () => {
        const actual = await detectLocalLambdas([])

        assert.ok(actual)
        assert.equal(actual.length, 0)
    })

    test('detects no lambdas when template.y[a]ml does not exist', async () => {
        const workspacePath = await createTemporaryDirectory('vsctk1')

        try {
            const workspaceFolder: WorkspaceFolder = {
                uri: Uri.file(workspacePath),
                name: path.basename(workspacePath),
                index: 0
            }

            const actual = await detectLocalLambdas([ workspaceFolder ])

            assert.ok(actual)
            assert.equal(actual.length, 0)
        } finally {
            await del([ workspacePath ], { force: true })
        }
    })

    test('detects no lambdas when template.y[a]ml is empty', async () => {
        const workspacePath = await createTemporaryDirectory('vsctk1')

        try {
            const workspaceFolder: WorkspaceFolder = {
                uri: Uri.file(workspacePath),
                name: path.basename(workspacePath),
                index: 0
            }

            await saveTemplate(path.join(workspaceFolder.uri.fsPath, 'template.yml'))
            const actual = await detectLocalLambdas([ workspaceFolder ])

            assert.ok(actual)
            assert.equal(actual.length, 0)
        } finally {
            await del([ workspacePath ], { force: true })
        }
    })

    test('detects lambdas when template.yml exists', async () => {
        const workspacePath = await createTemporaryDirectory('vsctk1')

        try {
            const workspaceFolder: WorkspaceFolder = {
                uri: Uri.file(workspacePath),
                name: path.basename(workspacePath),
                index: 0
            }

            const templatePath = path.join(workspaceFolder.uri.fsPath, 'template.yml')
            await saveTemplate(templatePath, 'MyFunction')
            const actual = await detectLocalLambdas([ workspaceFolder ])

            assert.ok(actual)
            assert.equal(actual.length, 1)
            assert.ok(actual[0])
            assert.equal(actual[0].lambda, 'MyFunction')
            assert.equal(actual[0].templatePath, templatePath)
        } finally {
            await del([ workspacePath ], { force: true })
        }
    })

    test('detects lambdas when template.yaml exists', async () => {
        const workspacePath = await createTemporaryDirectory('vsctk1')

        try {
            const workspaceFolder: WorkspaceFolder = {
                uri: Uri.file(workspacePath),
                name: path.basename(workspacePath),
                index: 0
            }

            const templatePath = path.join(workspaceFolder.uri.fsPath, 'template.yaml')
            await saveTemplate(templatePath, 'MyFunction')
            const actual = await detectLocalLambdas([ workspaceFolder ])

            assert.ok(actual)
            assert.equal(actual.length, 1)
            assert.ok(actual[0])
            assert.equal(actual[0].lambda, 'MyFunction')
            assert.equal(actual[0].templatePath, templatePath)
        } finally {
            await del([ workspacePath ], { force: true })
        }
    })

    test('detects lambdas in multi-folder workspace', async () => {
        const workspacePath1 = await createTemporaryDirectory('vsctk1')
        const workspacePath2 = await createTemporaryDirectory('vsctk2')

        try {
            const workspaceFolder1: WorkspaceFolder = {
                uri: Uri.file(workspacePath1),
                name: path.basename(workspacePath1),
                index: 0
            }
            const workspaceFolder2: WorkspaceFolder = {
                uri: Uri.file(workspacePath2),
                name: path.basename(workspacePath2),
                index: 0
            }

            const templatePath1 = path.join(workspaceFolder1.uri.fsPath, 'template.yaml')
            const templatePath2 = path.join(workspaceFolder2.uri.fsPath, 'template.yml')

            await saveTemplate(templatePath1, 'MyFunction1')
            await saveTemplate(templatePath2, 'MyFunction2')
            const actual = await detectLocalLambdas([ workspaceFolder1, workspaceFolder2 ])

            assert.ok(actual)
            assert.equal(actual.length, 2)
            assert.ok(actual[0])
            assert.equal(actual[0].lambda, 'MyFunction1')
            assert.equal(actual[0].templatePath, templatePath1)
            assert.ok(actual[1])
            assert.equal(actual[1].lambda, 'MyFunction2')
            assert.equal(actual[1].templatePath, templatePath2)
        } finally {
            await del([ workspacePath1, workspacePath2 ], { force: true })
        }
    })
})
