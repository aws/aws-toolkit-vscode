/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-undef */
/* eslint-disable no-case-declarations */

const autoSaveIntervalTimeout = 1000
const checkThreatComposerAPITimeout = 50

const vscode = acquireVsCodeApi()
const instanceMapper = {}
let disableAutoSave = false
let theme = 'unknown'

// Handle messages sent from the extension to the webview
window.addEventListener('message', handleMessage)

function handleMessage(event) {
    const message = event.data // The json data that the extension sent

    if (message.messageType === 'BROADCAST') {
        switch (message.command) {
            case 'FILE_CHANGED':
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
                applyTheme(message.newTheme)
                break

            case 'OVERWRITE_FILE':
                disableAutoSave = false
                break
        }
    } else if (message.messageType === 'RESPONSE') {
        switch (message.command) {
            case 'SAVE_FILE':
                if (message.isSuccess) {
                    console.log('File Saved successfully')
                    disableAutoSave = false
                } else {
                    console.log('File Save unsuccessful')
                }
                break
        }
    }
}

function updateContent(/** @type {string} */ text) {
    if (document.readyState !== 'loading') {
        void render(text)
    } else {
        document.addEventListener('DOMContentLoaded', function () {
            void render(text)
        })
    }
}

async function checkThreatComposerAPI() {
    while (!window.threatcomposer || !window.threatcomposer.setCurrentWorkspaceData) {
        await new Promise((r) => setTimeout(r, checkThreatComposerAPITimeout))
    }
}

/**
 * Render the document in the webview.
 */
async function render(/** @type {string} */ text) {
    await checkThreatComposerAPI()

    vscode.postMessage({
        command: 'LOAD_STAGE',
        messageType: 'BROADCAST',
        loadStage: 'API_LOADED',
    })

    try {
        let threatModel = text && JSON.parse(text)
        await window.threatcomposer.setCurrentWorkspaceData(threatModel)
    } catch (e) {
        disableAutoSave = true
        await window.threatcomposer.setCurrentWorkspaceData('')
        vscode.postMessage({
            command: 'LOG',
            messageType: 'BROADCAST',
            logMessage: e.message,
            logType: 'ERROR',
            showNotification: true,
            notificationType: 'INVALID_JSON',
        })
    }

    let defaultTemplate = ''

    if (text === '') {
        const initialState = await window.threatcomposer.getCurrentWorkspaceData()
        defaultTemplate = window.threatcomposer.stringifyWorkspaceData(initialState)
    }

    window.threatcomposer.addEventListener('save', (e) => {
        const stringyfiedData = window.threatcomposer.stringifyWorkspaceData(e.detail)
        const currentState = vscode.getState()
        currentState.fileContents = stringyfiedData
        vscode.setState(currentState)
        disableAutoSave = true

        vscode.postMessage({
            command: 'SAVE_FILE',
            messageType: 'REQUEST',
            fileContents: stringyfiedData,
        })
    })

    autoSaveInterval = setInterval(async () => {
        if (disableAutoSave) {
            return
        }

        const data = await window.threatcomposer.getCurrentWorkspaceData()
        const stringyfiedData = window.threatcomposer.stringifyWorkspaceData(data)

        const currentState = vscode.getState()

        if (stringyfiedData === defaultTemplate || stringyfiedData === currentState.fileContents) {
            return
        }

        currentState.fileContents = stringyfiedData
        vscode.setState(currentState)

        vscode.postMessage({
            command: 'AUTO_SAVE_FILE',
            messageType: 'REQUEST',
            fileContents: stringyfiedData,
        })
    }, autoSaveIntervalTimeout)

    vscode.postMessage({
        command: 'LOAD_STAGE',
        messageType: 'BROADCAST',
        loadStage: 'RENDER_COMPLETE',
    })
}

function applyTheme(newTheme) {
    if (!newTheme || theme === newTheme) {
        return
    }
    theme = newTheme

    window.threatcomposer.applyTheme(newTheme)
}

// Webviews are normally torn down when not visible and re-created when they become visible again.
// State lets us save information across these re-loads
const state = vscode.getState()
if (state && state.fileContents) {
    vscode.postMessage({
        command: 'RELOAD',
        messageType: 'REQUEST',
    })
} else {
    vscode.postMessage({
        command: 'INIT',
        messageType: 'REQUEST',
    })
}
