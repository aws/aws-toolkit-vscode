/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import * as assert from 'assert'
import * as fs from 'fs-extra'
import * as path from 'path'
import { makeTemporaryToolkitFolder } from '../../../shared/filesystemUtilities'
import { findApplicationJsonFile, getFunctionNames } from '../../../lambda/commands/uploadLambda'

describe('uploadLambda', async function () {
    let tempFolder: string
    let folderUri: vscode.Uri
    const dotApplicationJsonData = `{
        "DeploymentMethod": "lambda",
        "Functions": {
            "sampleFunction": {
                "PhysicalId": {
                    "us-west-2": "sampleFunction",
                    "us-east-1": "sampleFunction"
                }
            },
            "differentFunction": {
                "PhysicalId": {
                    "us-east-1": "differentFunction"
                }
            }
        }
    }`
    beforeEach(async function () {
        tempFolder = await makeTemporaryToolkitFolder()
        folderUri = vscode.Uri.file(tempFolder)
    })
    afterEach(async function () {
        await fs.remove(tempFolder)
    })

    it('finds application.json file from dir path - flat', async function () {
        fs.writeFileSync(path.join(tempFolder, '.application.json'), 'top secret data')
        const foundFiles = await findApplicationJsonFile(folderUri)
        assert.strictEqual(foundFiles?.fsPath, vscode.Uri.file(path.join(tempFolder, '.application.json')).fsPath)
    })

    it('finds application.json file from dir path - nested', async function () {
        const subfolder = path.join(tempFolder, 'one')
        fs.mkdirSync(subfolder)

        fs.writeFileSync(path.join(subfolder, '.application.json'), 'top secret data')
        const foundFiles = await findApplicationJsonFile(folderUri)
        assert.strictEqual(foundFiles?.fsPath, vscode.Uri.file(path.join(subfolder, '.application.json')).fsPath)
    })

    it('finds application.json file from template file path', async function () {
        const templateUri = vscode.Uri.file(path.join(tempFolder, 'template.yaml'))
        fs.writeFileSync(path.join(tempFolder, '.application.json'), 'top secret data')
        const foundFiles = await findApplicationJsonFile(templateUri)
        assert.strictEqual(foundFiles?.fsPath, vscode.Uri.file(path.join(tempFolder, '.application.json')).fsPath)
    })

    it('lists functions from .application.json', async function () {
        const filePath = path.join(tempFolder, '.application.json')
        fs.writeFileSync(filePath, dotApplicationJsonData)
        const foundFunctions1 = getFunctionNames(vscode.Uri.file(filePath), 'us-west-2')
        const foundFunctions2 = getFunctionNames(vscode.Uri.file(filePath), 'us-east-1')
        assert.deepStrictEqual(foundFunctions1, ['sampleFunction'])
        assert.deepStrictEqual(foundFunctions2, ['sampleFunction', 'differentFunction'])
    })
})
