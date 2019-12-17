/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { mkdirp, writeFile } from 'fs-extra'
import * as path from 'path'
import * as vscode from 'vscode'
import { detectLocalTemplates } from '../../../lambda/local/detectLocalTemplates'
import { rmrf } from '../../../shared/filesystem'
import { makeTemporaryToolkitFolder } from '../../../shared/filesystemUtilities'

let workspaceFolderPath: string

function normalizePath(...paths: string[]): string {
    return vscode.Uri.file(path.join(...paths)).fsPath
}

describe('detectLocalTemplates', async () => {
    // Make folder
    beforeEach(async () => {
        workspaceFolderPath = await makeTemporaryToolkitFolder()
    })

    // cleanup generated folders after each
    afterEach(async () => {
        await rmrf(workspaceFolderPath)
    })

    it('Detects no templates when there are no workspace folders', async () => {
        for await (const template of detectLocalTemplates({ workspaceUris: [] })) {
            assert.fail(`Expected no templates, but found '${template.fsPath}'`)
        }
    })

    it('Detects templates at the root of each workspace folder', async () => {
        await writeFile(normalizePath(workspaceFolderPath, 'template.yaml'), '')

        const result = detectLocalTemplates({ workspaceUris: [vscode.Uri.file(workspaceFolderPath)] })

        const templates: vscode.Uri[] = []
        for await (const template of result) {
            templates.push(template)
        }

        assert.strictEqual(templates.length, 1)
        assert.strictEqual(templates[0].fsPath, normalizePath(workspaceFolderPath, 'template.yaml'))
    })

    it('Detects templates in child folders of each workspace folder', async () => {
        const workspaceFolderChildPath = normalizePath(workspaceFolderPath, 'child')
        await mkdirp(workspaceFolderChildPath)
        await writeFile(normalizePath(workspaceFolderChildPath, 'template.yaml'), '')

        const result = detectLocalTemplates({
            workspaceUris: [vscode.Uri.file(workspaceFolderPath)]
        })

        const templates: vscode.Uri[] = []
        for await (const template of result) {
            templates.push(template)
        }

        assert.strictEqual(templates.length, 1)
        assert.strictEqual(templates[0].fsPath, normalizePath(workspaceFolderChildPath, 'template.yaml'))
    })

    it('does not detect templates deeper than the specified folder depth', async () => {
        const workspaceFolderChildPath = normalizePath(workspaceFolderPath, 'child', 'child2', 'child3', 'child4')
        await mkdirp(workspaceFolderChildPath)
        await writeFile(normalizePath(workspaceFolderChildPath, 'template.yaml'), '')
        const result = detectLocalTemplates({ workspaceUris: [vscode.Uri.file(workspaceFolderPath)], folderDepth: 3 })
        const templates: vscode.Uri[] = []
        for await (const template of result) {
            templates.push(template)
        }

        assert.strictEqual(templates.length, 0)
    })

    it('Detects multiple templates when multiple folders contain templates', async () => {
        const workspaceFolderChildPath1 = normalizePath(workspaceFolderPath, 'child1')
        const workspaceFolderChildPath2 = normalizePath(workspaceFolderPath, 'child2')
        await mkdirp(workspaceFolderChildPath1)
        await mkdirp(workspaceFolderChildPath2)
        await writeFile(normalizePath(workspaceFolderChildPath1, 'template.yaml'), '')
        await writeFile(normalizePath(workspaceFolderChildPath2, 'template.yaml'), '')

        const result = detectLocalTemplates({ workspaceUris: [vscode.Uri.file(workspaceFolderPath)] })

        const templates: vscode.Uri[] = []
        for await (const template of result) {
            templates.push(template)
        }

        assert.strictEqual(templates.length, 2)
        assert.ok(templates.some(t => t.fsPath === normalizePath(workspaceFolderChildPath1, 'template.yaml')))
        assert.ok(templates.some(t => t.fsPath === normalizePath(workspaceFolderChildPath2, 'template.yaml')))
    })

    it('Detects multiple templates when both template.yml and template.yaml exist in a folder', async () => {
        const workspaceFolderChildPath = normalizePath(workspaceFolderPath, 'child')
        await mkdirp(workspaceFolderChildPath)
        await writeFile(normalizePath(workspaceFolderChildPath, 'template.yaml'), '')
        await writeFile(normalizePath(workspaceFolderChildPath, 'template.yml'), '')

        const result = detectLocalTemplates({ workspaceUris: [vscode.Uri.file(workspaceFolderPath)] })

        const templates: vscode.Uri[] = []
        for await (const template of result) {
            templates.push(template)
        }

        assert.strictEqual(templates.length, 2)
        assert.ok(templates.some(t => t.fsPath === normalizePath(workspaceFolderChildPath, 'template.yaml')))
        assert.ok(templates.some(t => t.fsPath === normalizePath(workspaceFolderChildPath, 'template.yml')))
    })
})
