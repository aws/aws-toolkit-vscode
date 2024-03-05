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
window.addEventListener('message', event => {
    const message = event.data // The json data that the extension sent
    console.log('message')
    console.log(event)
    switch (message.command) {
        case 'FILE_CHANGED':
            console.log('FILE_CHANGED')
            const fileContents = message.fileContents
            // Update our webview's content
            updateContent(fileContents)

            // Then persist state information.
            // This state is returned in the call to `vscode.getState` below when a webview is reloaded.
            vscode.setState({
                data: fileContents,
            })
            break

        case 'THEME_CHANGED':
            console.log('THEME_CHANGED')
            applyTheme(message.newTheme)
            break
    }
})

function updateContent(/** @type {string} */ text) {
    if (document.readyState === 'complete') {
        render(text)
    } else {
        document.addEventListener('DOMContentLoaded', function () {
            render(text)
        })
    }
}

/**
 * Render the document in the webview.
 */
function render(/** @type {string} */ text) {
    let threatModel
    try {
        if (!text) {
            text = '{}'
        }
        threatModel = JSON.parse(text)
    } catch {
        return
    }

    window.threatcomposer.setCurrentWorkspaceData(threatModel)
    window.threatcomposer.addEventListener('save', e => {
        vscode.postMessage({
            command: 'SAVE_FILE',
            messageType: 'REQUEST',
            fileContents: window.threatcomposer.stringifyWorkspaceData(e.detail),
        })
        vscode.setState({
            data: e.detail,
        })
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
    updateContent(state.data)
}

console.log('VSCodeExtensionInterface loaded')
