/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import assert from 'assert'
import * as fs from 'fs-extra'
import * as path from 'path'
import { makeTemporaryToolkitFolder } from '../../../shared/filesystemUtilities'
import { findApplicationJsonFile, getFunctionNames } from '../../../lambda/commands/uploadLambda'
import { assertEqualPaths, toFile } from '../../testUtil'

describe('uploadLambda', async function () {
    let tempFolder: string
    let folderUri: vscode.Uri
    const dotApplicationJsonData = `{
        "DeploymentMethod": "lambda",
        "Functions": {
            "sampleFunction": {
                "PhysicalId": {
                    "us-west-2": "sampleFunction-w2",
                    "us-east-1": "sampleFunction-e1"
                }
            },
            "differentFunction": {
                "PhysicalId": {
                    "us-east-1": "differentFunction-e1"
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
        await toFile('top secret data', path.join(tempFolder, '.application.json'))
        assertEqualPaths(
            (await findApplicationJsonFile(folderUri))?.fsPath ?? '',
            path.join(tempFolder, '.application.json')
        )
        // Also test Cloud9 temporary workaround.
        assertEqualPaths(
            (await findApplicationJsonFile(folderUri, true))?.fsPath ?? '',
            path.join(tempFolder, '.application.json')
        )
    })

    it('finds application.json file from dir path - nested', async function () {
        const subfolder = path.join(tempFolder, 'one', 'two')
        const appjsonPath = path.join(subfolder, '.application.json')
        await toFile('top secret data', appjsonPath)

        assertEqualPaths((await findApplicationJsonFile(folderUri))?.fsPath ?? '', appjsonPath)
        // Also test Cloud9 temporary workaround.
        assertEqualPaths((await findApplicationJsonFile(folderUri, true))?.fsPath ?? '', appjsonPath)
    })

    it('finds application.json file from template file path', async function () {
        const templateUri = vscode.Uri.file(path.join(tempFolder, 'template.yaml'))
        const appjsonPath = path.join(tempFolder, '.application.json')
        await toFile('SAM stuff...', templateUri.fsPath)
        await toFile('top secret data', appjsonPath)

        assertEqualPaths((await findApplicationJsonFile(templateUri))?.fsPath ?? '', appjsonPath)
        // Also test Cloud9 temporary workaround.
        assertEqualPaths((await findApplicationJsonFile(templateUri, true))?.fsPath ?? '', appjsonPath)
    })

    it('lists functions from .application.json', async function () {
        const filePath = path.join(tempFolder, '.application.json')
        await toFile(dotApplicationJsonData, filePath)
        const foundFunctions1 = await getFunctionNames(vscode.Uri.file(filePath), 'us-west-2')
        const foundFunctions2 = await getFunctionNames(vscode.Uri.file(filePath), 'us-east-1')
        assert.deepStrictEqual(foundFunctions1, ['sampleFunction-w2'])
        assert.deepStrictEqual(foundFunctions2, ['sampleFunction-e1', 'differentFunction-e1'])
    })

    it('invalid .application.json', async function () {
        const filePath = path.join(tempFolder, '.application.json')
        const invalidJson = '{ "DeploymentMethod": "lambda", "Functions": { ?? } }'
        await toFile(invalidJson, filePath)
        assert.deepStrictEqual(await getFunctionNames(vscode.Uri.file(filePath), 'us-west-2'), undefined)
        assert.deepStrictEqual(await getFunctionNames(vscode.Uri.file(filePath), 'us-east-1'), undefined)
    })
})
