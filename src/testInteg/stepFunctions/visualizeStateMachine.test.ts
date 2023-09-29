/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as fs from 'fs-extra'
import * as vscode from 'vscode'
import * as sinon from 'sinon'
import { MessageObject } from '../../stepFunctions/commands/visualizeStateMachine/aslVisualization'
import { makeTemporaryToolkitFolder } from '../../shared/filesystemUtilities'
import { closeAllEditors, openATextEditorWithText } from '../../test/testUtil'
import { previewStateMachineCommand } from '../../stepFunctions/activation'

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

const samleStateMachineYaml = `
    Comment: "A Hello World example of the Amazon States Language using Pass states"
    StartAt: Hello
    States:
    Hello:
        Type: Pass
        Result: Hello
        Next: World
    World:
        Type: Pass
        Result: \$\{Text\}
        End: true
`

let tempFolder: string

async function waitUntilWebviewIsVisible(webviewPanel: vscode.WebviewPanel | undefined): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        if (webviewPanel) {
            webviewPanel.webview.onDidReceiveMessage((message: MessageObject) => {
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

describe('visualizeStateMachine', async function () {
    before(async function () {
        this.timeout(600000)
    })

    beforeEach(async function () {
        // Make a temp folder for all these tests
        tempFolder = await makeTemporaryToolkitFolder()
    })

    afterEach(async function () {
        await fs.remove(tempFolder)
        sinon.restore()
    })

    after(async function () {
        // Test suite cleans up after itself
        await closeAllEditors()
    })

    it('opens up a webview when there is an active text editor', async function () {
        const stateMachineFileText = '{}'
        const fileName = 'mysamplestatemachine.json'
        await openATextEditorWithText(stateMachineFileText, fileName, tempFolder)

        const result = await previewStateMachineCommand.execute()

        assert.ok(result)
    }).timeout(15000) // Give the first test that calls aws.previewStateMachine a chance to download the visualizer

    it('correctly displays content when given a sample state machine', async function () {
        const fileName = 'mysamplestatemachine.json'
        const textEditor = await openATextEditorWithText(sampleStateMachine, fileName, tempFolder)

        const result = await previewStateMachineCommand.execute()

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

    it('correctly displays content when given a sample state machine in yaml', async function () {
        const fileName = 'mysamplestatemachine.asl.yaml'
        const textEditor = await openATextEditorWithText(samleStateMachineYaml, fileName, tempFolder)

        const result = await previewStateMachineCommand.execute()

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

    it('update webview is triggered when user saves correct text editor', async function () {
        const stateMachineFileText = '{}'
        const fileName = 'mysamplestatemachine.json'
        const textEditor = await openATextEditorWithText(stateMachineFileText, fileName, tempFolder)

        const result = await previewStateMachineCommand.execute()

        assert.ok(result)

        if (result) {
            const viewStateChanged = new Promise<vscode.WebviewPanelOnDidChangeViewStateEvent>(resolve => {
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

    it('doesnt update the graph if a seperate file is opened or modified', async function () {
        const stateMachineFileText = '{}'
        const stateMachineDefinitionFile = 'mystatemachine.json'
        await openATextEditorWithText(stateMachineFileText, stateMachineDefinitionFile, tempFolder)

        const result = await previewStateMachineCommand.execute()
        assert.ok(result)

        await waitUntilWebviewIsVisible(result)

        // Here we will create a second file unrelated to the existing graph in VS Code.
        const someOtherFileText = 'Some other file that is not related to state machine.'
        const someOtherFileName = 'fileTwo'

        const textEditor2 = await openATextEditorWithText(someOtherFileText, someOtherFileName, tempFolder)

        const updatedText = 'updated text'

        const postMessageSpy = sinon.spy()
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

        // The state machine graph should not update.
        assert(postMessageSpy.notCalled)
    })
})
