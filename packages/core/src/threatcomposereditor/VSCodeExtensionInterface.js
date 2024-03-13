/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-undef */
/* eslint-disable no-case-declarations */

const vscode = acquireVsCodeApi()
const instanceMapper = {}
var theme = 'unknown'

// Handle messages sent from the extension to the webview
window.addEventListener('message', handelMessage)

function handelMessage(event) {
    const message = event.data // The json data that the extension sent
    console.log('message')
    console.log(event)
    switch (message.command) {
        case 'FILE_CHANGED':
            console.log('FILE_CHANGED')
            const fileContents = message.fileContents

            // Persist state information.
            // This state is returned in the call to `vscode.getState` below when a webview is reloaded.
            vscode.setState({
                fileName: message.fileName,
                filePath: message.filePath,
                fileContents: fileContents,
            })

            // Update our webview's content
            updateContent(fileContents)
            break

        case 'THEME_CHANGED':
            console.log('THEME_CHANGED')
            applyTheme(message.newTheme)
            break
    }
}

window.addEventListener('beforeunload', beforeUnloadHandler)

function beforeUnloadHandler(event) {
    console.log('PANEL_DISPOSED')
    window.removeEventListener('message', handelMessage)
    window.removeEventListener('beforeunload', beforeUnloadHandler)
    const state = vscode.getState()
    window.threatcomposer.deleteWorkspace(state.workspaceId)
}

function updateContent(/** @type {string} */ text) {
    if (document.readyState === 'complete') {
        void render(text)
    } else {
        document.addEventListener('DOMContentLoaded', function () {
            void render(text)
        })
    }
}

async function checkThreatComposerAPI() {
    while (!window.threatcomposer.setCurrentWorkspaceData) {
        console.debug('Waiting for window.threatcomposer.setCurrentWorkspaceData to be ready.')
        await sleep(50)
    }
}

/**
 * Render the document in the webview.
 */
async function render(/** @type {string} */ text) {
    let threatModel
    try {
        if (!text) {
            text = '{}'
        }
        threatModel = JSON.parse(text)
    } catch {
        return
    }

    await checkThreatComposerAPI()

    const state = vscode.getState()

    if (state.workspaceId) {
        window.threatcomposer.switchWorkspace(state.workspaceId)
    } else {
        const workspaceObject = await window.threatcomposer.createWorkspace(state.fileName, 'LocalStorage')
        window.threatcomposer.setCurrentWorkspaceData(threatModel)
        state.workspaceId = workspaceObject.id
        state.name = workspaceObject.name
        state.storageType = workspaceObject.storageType
        vscode.setState(state)
    }

    // window.threatcomposer.setCurrentWorkspaceData(threatModel)
    window.threatcomposer.addEventListener('save', e => {
        vscode.postMessage({
            command: 'SAVE_FILE',
            messageType: 'REQUEST',
            fileContents: window.threatcomposer.stringifyWorkspaceData(e.detail),
        })
        const currentState = vscode.getState()
        currentState.fileContents = e.detail
        vscode.setState(currentState)
    })
}

function applyTheme(newTheme) {
    if (!newTheme || theme === newTheme) {
        return
    }
    theme = newTheme

    console.log('Applying theme: ')
    console.log(newTheme)
    window.threatcomposer.applyTheme(newTheme)
}

// Webviews are normally torn down when not visible and re-created when they become visible again.
// State lets us save information across these re-loads
const state = vscode.getState()
if (state) {
    console.log(state)
    updateContent(state.fileContents)
}

console.log('VSCodeExtensionInterface loaded')
