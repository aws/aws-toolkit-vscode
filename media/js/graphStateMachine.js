/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

const vscode = acquireVsCodeApi()

let containerId = "#svgcontainer"

let options = {
    width: window.innerWidth,
    height: window.innerHeight,
    resizeHeight: true
}

// Message passing from extension to webview.
// Capture state machine definition
window.addEventListener('message', event => {
    // event.data is object passed in from postMessage from vscode
    const message = event.data
    switch (message.command) {
        case 'update':
            console.log("Updating state machine: " + message.stateMachineData)
            try {
                graph = new sfn.StateMachineGraph(JSON.parse(message.stateMachineData), containerId, options)
                graph.render()

                vscode.postMessage({
                    command: 'updateResult',
                    text: 'Successfully updated state machine graph.',
                    stateMachineData: message.stateMachineData
                })
            } catch (err) {
                console.log('Error parsing state machine definition.')
                console.log(err)
                vscode.postMessage({
                    command: 'updateResult',
                    text: 'Error parsing state machine definition.',
                    error: err.toString(),
                    stateMachineData: message.stateMachineData
                })
            }

            break
    }
})

// Let vscode know that the webview is finished rendering
vscode.postMessage({
    command: 'webviewRendered',
    text: 'Webivew has finished rendering and is visible'
})