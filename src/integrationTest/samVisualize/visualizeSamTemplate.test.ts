/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as fs from 'fs-extra'
import * as path from 'path'
import * as vscode from 'vscode'
import { makeTemporaryToolkitFolder } from '../../shared/filesystemUtilities'
import { spy } from 'sinon'
import { closeAllEditors } from '../../shared/utilities/vsCodeUtils'

const sampleSamTemplateFileName = 'helloWorld.yaml'
const sampleSamTemplateYaml = `
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31
Description: >
    samp-app
    Sample SAM Template for samp-app

Resources:
    HelloWorldFunction:
        Type: AWS::Serverless::Function 
        Properties:
            CodeUri: hello-world/
            Handler: app.lambdaHandler
            Runtime: nodejs14.x
            Events:
                HelloWorld:
                    Type: Api
                    Properties:
                        Path: /hello
                        Method: get`
/**
 * Helper function to create a text file with supplied content and open it with a TextEditor
 *
 * @param fileText The supplied text to fill this file with
 * @param fileName The name of the file to save it as. Include the file extension here.
 *
 * @returns TextEditor that was just opened
 */
async function openATextEditorWithText(fileText: string, fileName: string): Promise<vscode.TextEditor> {
    const completeFilePath = path.join(tempFolder, fileName)
    await fs.writeFile(completeFilePath, fileText)

    const textDocument = await vscode.workspace.openTextDocument(completeFilePath)

    return await vscode.window.showTextDocument(textDocument)
}
let tempFolder: string
describe('visualizeSamTemplate', async function () {
    beforeEach(async function () {
        // Make a temp folder for all these tests
        tempFolder = await makeTemporaryToolkitFolder()
    })

    afterEach(async function () {
        await fs.remove(tempFolder)
    })

    after(async function () {
        // Test suite cleans up after itself
        await closeAllEditors()
    })

    it('correctly displays content when given an active editor containing a valid SAM Template', async function () {
        await openATextEditorWithText(sampleSamTemplateYaml, sampleSamTemplateFileName)
        const result = await vscode.commands.executeCommand<vscode.WebviewPanel>('aws.samVisualize.renderTemplate')

        assert.ok(result)
        assert.deepStrictEqual(result.title, `${sampleSamTemplateFileName} (Rendering)`)
        assert.deepStrictEqual(result.viewType, 'samVisualization')
        assert.ok(result.webview.html)
    })

    it('update webview when the editor is changed', async function () {
        const textEditor = await openATextEditorWithText('Sample Text', sampleSamTemplateFileName)

        const result = await vscode.commands.executeCommand<vscode.WebviewPanel>('aws.samVisualize.renderTemplate')

        assert.ok(result)

        const didViewStateChange = new Promise<vscode.WebviewPanelOnDidChangeViewStateEvent>(resolve => {
            result.onDidChangeViewState(event => {
                assert.ok(event)
                resolve(event)
            })
        })

        // Edit the editor to replace the entire file with a working SAM template
        await textEditor.edit(edit => {
            edit.replace(
                new vscode.Range(
                    textEditor.document.positionAt(0),
                    textEditor.document.positionAt(textEditor.document.getText().length)
                ),
                sampleSamTemplateYaml
            )
        })

        await didViewStateChange
    })

    it('throws an error if no text editor is open', async function () {
        // Ensure no text editor is open
        await closeAllEditors()

        await assert.rejects(async () => {
            await vscode.commands.executeCommand<vscode.WebviewPanel>('aws.samVisualize.renderTemplate')
        })
    })

    it('doesnt update the graph if a seperate file is opened or modified', async function () {
        await openATextEditorWithText(sampleSamTemplateYaml, sampleSamTemplateFileName)

        const result = await vscode.commands.executeCommand<vscode.WebviewPanel>('aws.samVisualize.renderTemplate')
        assert.ok(result)

        // Here we will create a second file unrelated to the existing graph in VS Code.

        const someOtherFileName = 'other.yaml'
        const someOtherFileText = 'Random contents'

        const textEditor2 = await openATextEditorWithText(someOtherFileText, someOtherFileName)

        const updatedText = 'updated text'

        const postMessageSpy = spy()
        if (result) {
            // eslint-disable-next-line @typescript-eslint/unbound-method
            result.webview.postMessage = postMessageSpy
        }

        // Update and save the file that we are NOT visualizing
        await textEditor2.edit(eb => {
            eb.replace(
                new vscode.Range(
                    textEditor2.document.positionAt(0),
                    textEditor2.document.positionAt(textEditor2.document.getText().length)
                ),
                updatedText
            )
        })

        // Save the file
        await textEditor2.document.save()

        // The visualization should not update.
        assert(postMessageSpy.notCalled)
    })
})
