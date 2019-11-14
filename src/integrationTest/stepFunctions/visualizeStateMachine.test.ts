/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as del from 'del'
import * as path from 'path'
import { spy } from 'sinon'
import * as vscode from 'vscode'
import { writeFile } from '../../shared/filesystem'
import { makeTemporaryToolkitFolder } from '../../shared/filesystemUtilities'
import { messageObject, visualizeStateMachine } from '../../stepFunctions/commands/visualizeStateMachine'

const sampleStateMachine = `
	 {
	     "StartAt": "Parallel State",
	     "States": {
	         "Parallel State": {
	             "Type": "Parallel",
	             "Branches": [
	                 {
	                     "StartAt": "AAA",
	                         "States": {
	                         "AAA": {
	                             "Type": "Task",
	                             "Resource": "arn:aws:states:us-east-1:204340511724:activity:WriteTicket",
	                             "End": true
	                         }
	                     }
	                 },
	                 {
	                     "StartAt": "BBB",
	                         "States": {
	                         "BBB": {
	                             "Type": "Task",
	                             "Resource": "arn:aws:lambda:us-east-1:204340511724:function:CustomerImpactChimeBot",
	                             "End": true
	                         }
	                     }
	                 }
	             ],
	             "ResultPath" : "$.CommentStatus",
	             "End": true
	         }
	     }
	 }`

let tempFolder: string

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
    await writeFile(completeFilePath, fileText)

    const textDocument = await vscode.workspace.openTextDocument(completeFilePath)

    return await vscode.window.showTextDocument(textDocument)
}

async function waitUntilWebviewIsVisible(webviewPanel: vscode.WebviewPanel | undefined): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        if (webviewPanel) {
            webviewPanel.webview.onDidReceiveMessage((message: messageObject) => {
                switch (message.command) {
                    case 'webviewRendered':
                        resolve()
                        break
                }
            })
        } else {
            reject()
        }
    })
}

describe('visualizeStateMachine', async () => {

    beforeEach(async () => {
        // Make a temp folder for all these tests
        tempFolder = await makeTemporaryToolkitFolder()
    })

    afterEach(async () => {
        await del([tempFolder], { force: true })
    })

    after(async () => {
        // Test suite cleans up after itself
        await vscode.commands.executeCommand('workbench.action.closeAllEditors')
    })

    it('opens up a webview when there is an active text editor', async () => {
        const stateMachineFileText = '{}'
        const fileName = 'mysamplestatemachine.json'
        await openATextEditorWithText(stateMachineFileText, fileName)

        const webviewPanel = await visualizeStateMachine()

        assert.ok(webviewPanel)
    })

    it('correctly displays content when given a sample state machine', async () => {
        const fileName = 'mysamplestatemachine.json'
        const textEditor = await openATextEditorWithText(sampleStateMachine, fileName)

        const result = await vscode.commands.executeCommand<vscode.WebviewPanel>('aws.renderStateMachine')

        assert.ok(result)

        await waitUntilWebviewIsVisible(result)

        let expectedViewColumn
        if (textEditor.viewColumn) {
            expectedViewColumn = textEditor.viewColumn.valueOf() + 1
        }

        if (result) {
            assert.deepStrictEqual(result.title, 'Graph: ' + fileName)
            assert.deepStrictEqual(result.viewColumn, expectedViewColumn)
            assert.deepStrictEqual(result.viewType, 'stateMachineVisualization')
            assert.ok(result.webview.html)
        }

    })

    it('update webview is triggered when user saves correct text editor', async () => {
        const stateMachineFileText = '{}'
        const fileName = 'mysamplestatemachine.json'
        const textEditor = await openATextEditorWithText(stateMachineFileText, fileName)

        const result =
            await vscode.commands.executeCommand<vscode.WebviewPanel>('aws.renderStateMachine')

        assert.ok(result)

        if (result) {
            const viewStateChanged = new Promise<vscode.WebviewPanelOnDidChangeViewStateEvent>((resolve) => {
                result.onDidChangeViewState(e => {
                    // Ensure that this event fires after document is saved
                    assert.ok(e)
                    resolve(e)
                })
            })

            await textEditor.edit(eb => {
                eb.replace(
                    new vscode.Range(
                        textEditor.document.positionAt(0),
                        textEditor.document.positionAt(textEditor.document.getText().length)
                    ),
                    sampleStateMachine
                )
            })

            await textEditor.document.save()

            await viewStateChanged
        }

    })

    it('throws an error if no active text editor is open', async () => {
        // Make sure nothing is open from previous tests.
        await vscode.commands.executeCommand('workbench.action.closeAllEditors')

        try {
            await visualizeStateMachine()
            // Putting assert.fail here. Otherwise, if the call does not throw an exception
            // the test would still pass.
            assert.fail()
        } catch (err) {
            const error = err as Error
            assert.deepStrictEqual(error.message, 'Could not grab active text editor for state machine render.')
        }
    })

    it('doesnt update the graph if a seperate file is opened or modified', async () => {
        const stateMachineFileText = '{}'
        const stateMachineDefinitionFile = 'mystatemachine.json'
        await openATextEditorWithText(stateMachineFileText, stateMachineDefinitionFile)

        const result = await vscode.commands.executeCommand<vscode.WebviewPanel>('aws.renderStateMachine')
        assert.ok(result)

        await waitUntilWebviewIsVisible(result)

        // Here we will create a second file unrelated to the existing graph in VS Code.
        const someOtherFileText = 'Some other file that is not related to state machine.'
        const someOtherFileName = 'fileTwo'

        const textEditor2 = await openATextEditorWithText(someOtherFileText, someOtherFileName)

        const updatedText = 'updated text'

        const postMessageSpy = spy()
        if (result) {
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

        // The state machine graph should not update.
        assert(postMessageSpy.notCalled)
    })
})
