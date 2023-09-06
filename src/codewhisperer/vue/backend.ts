/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()
import * as os from 'os'
import * as vscode from 'vscode'
import { VueWebview } from '../../webviews/main'
import { isCloud9 } from '../../shared/extensionUtilities'

import { telemetry } from '../../shared/telemetry/telemetry'

export class CodeWhispererWebview extends VueWebview {
    public readonly id = 'CodeWhispererWebview'
    public readonly source = 'src/codewhisperer/vue/index.js'

    //TODO: Prefill the sandbox files with the Predefined code
    codeInsertedPythonManual = false
    codeInsertedPythonAuto = false
    codeInsertedPythonUnit = false
    codeInsertedPythonComments = false

    codeInsertedJSManual = false
    codeInsertedJSAuto = false
    codeInsertedJSUnit = false
    codeInsertedJSComments = false

    codeInsertedCManual = false
    codeInsertedCAuto = false
    codeInsertedCUnit = false
    codeInsertedCComments = false

    async openNewTab(setting: vscode.Uri, predefinedCode: string): Promise<void> {
        vscode.workspace.openTextDocument(setting).then((a: vscode.TextDocument) => {
            vscode.window.showTextDocument(a, 1, false).then(e => {
                e.edit(edit => {
                    edit.insert(new vscode.Position(0, 0), predefinedCode)
                })
            })
        })
    }

    async openFile(name: string): Promise<void> {
        if (name === 'pythonAuto') {
            if (!this.codeInsertedPythonAuto) {
                const predefinedCode = `############################################ ${'\n'} # Try CodeWhisperer in this sandbox file # ${'\n'}############################################ ${'\n'}#${'\n'}# ====== Generate your first code suggestion ====== ${'\n'}# TODO: Prompt Amazon CodeWhisperer to generate a code suggestion for you. ${'\n'}# You can use the following code to generate a suggestion:"Function to upload a file to S3."${'\n'}${'\n'}# Function to upload a file to S3`
                const setting: vscode.Uri = vscode.Uri.parse('untitled:CodeWhisperer_Example1.py')
                this.openNewTab(setting, predefinedCode)
            }
            this.codeInsertedPythonAuto = true
            vscode.workspace.onDidCloseTextDocument(e => {
                this.codeInsertedPythonAuto = false
            })
        } else if (name === 'pythonManual') {
            if (!this.codeInsertedPythonManual) {
                const predefinedCode = `############################################ ${'\n'} # Try CodeWhisperer in this sandbox file # ${'\n'}############################################ ${'\n'}#${'\n'}# ====== Generate your first code suggestion ====== ${'\n'}# TODO: Prompt Amazon CodeWhisperer to generate a code suggestion for you. ${'\n'}# You can use the following code to generate a suggestion:"Function to upload a file to S3."${'\n'}${'\n'}# Function to upload a file to S3`
                const setting: vscode.Uri = vscode.Uri.parse('untitled:CodeWhisperer_Example2.py')
                this.openNewTab(setting, predefinedCode)
            }
            this.codeInsertedPythonManual = true
            vscode.workspace.onDidCloseTextDocument(e => {
                this.codeInsertedPythonManual = false
            })
        } else if (name === 'pythonComments') {
            if (!this.codeInsertedPythonComments) {
                const predefinedCode = `############################################ ${'\n'} # Try CodeWhisperer in this sandbox file # ${'\n'}############################################ ${'\n'}#${'\n'}# ====== Generate your first code suggestion ====== ${'\n'}# TODO: Prompt Amazon CodeWhisperer to generate a code suggestion for you. ${'\n'}# You can use the following code to generate a suggestion:"Function to upload a file to S3."${'\n'}${'\n'}# Function to upload a file to S3`
                const setting: vscode.Uri = vscode.Uri.parse('untitled:CodeWhisperer_Example3.py')
                this.openNewTab(setting, predefinedCode)
            }
            this.codeInsertedPythonComments = true
            vscode.workspace.onDidCloseTextDocument(e => {
                this.codeInsertedPythonComments = false
            })
        } else if (name === 'pythonUnit') {
            if (!this.codeInsertedPythonUnit) {
                const predefinedCode = `############################################ ${'\n'} # Try CodeWhisperer in this sandbox file # ${'\n'}############################################ ${'\n'}#${'\n'}# ====== Generate your first code suggestion ====== ${'\n'}# TODO: Prompt Amazon CodeWhisperer to generate a code suggestion for you. ${'\n'}# You can use the following code to generate a suggestion:"Function to upload a file to S3."${'\n'}${'\n'}# Function to upload a file to S3`
                const setting: vscode.Uri = vscode.Uri.parse('untitled:CodeWhisperer_Example4.py')
                this.openNewTab(setting, predefinedCode)
            }
            this.codeInsertedPythonUnit = true
            vscode.workspace.onDidCloseTextDocument(e => {
                this.codeInsertedPythonUnit = false
            })
        } else if (name === 'javaScriptAuto') {
            if (!this.codeInsertedJSAuto) {
                const predefinedCode = `//////////////////////////////////////////// ${'\n'}// Try CodeWhisperer in this sandbox file // ${'\n'}//////////////////////////////////////////// ${'\n'}//${'\n'}// ====== Generate your first code suggestion ====== ${'\n'}// TODO: Prompt Amazon CodeWhisperer to generate a code suggestion for you. ${'\n'}// You can use the following code to generate a suggestion:"Function to upload a file to S3."${'\n'}${'\n'}// Function to upload a file to S3`
                const setting: vscode.Uri = vscode.Uri.parse('untitled:CodeWhisperer_Example1.js')
                this.openNewTab(setting, predefinedCode)
            }
            this.codeInsertedJSAuto = true
            vscode.workspace.onDidCloseTextDocument(e => {
                this.codeInsertedJSAuto = false
            })
        } else if (name === 'javaScriptManual') {
            if (!this.codeInsertedJSManual) {
                const predefinedCode = `//////////////////////////////////////////// ${'\n'}// Try CodeWhisperer in this sandbox file // ${'\n'}//////////////////////////////////////////// ${'\n'}//${'\n'}// ====== Generate your first code suggestion ====== ${'\n'}// TODO: Prompt Amazon CodeWhisperer to generate a code suggestion for you. ${'\n'}// You can use the following code to generate a suggestion:"Function to upload a file to S3."${'\n'}${'\n'}// Function to upload a file to S3`
                const setting: vscode.Uri = vscode.Uri.parse('untitled:CodeWhisperer_Example2.js')
                this.openNewTab(setting, predefinedCode)
            }
            this.codeInsertedJSManual = true
            vscode.workspace.onDidCloseTextDocument(e => {
                this.codeInsertedJSManual = false
            })
        } else if (name === 'javaScriptComments') {
            if (!this.codeInsertedJSComments) {
                const predefinedCode = `//////////////////////////////////////////// ${'\n'}// Try CodeWhisperer in this sandbox file // ${'\n'}//////////////////////////////////////////// ${'\n'}//${'\n'}// ====== Generate your first code suggestion ====== ${'\n'}// TODO: Prompt Amazon CodeWhisperer to generate a code suggestion for you. ${'\n'}// You can use the following code to generate a suggestion:"Function to upload a file to S3."${'\n'}${'\n'}// Function to upload a file to S3`
                const setting: vscode.Uri = vscode.Uri.parse('untitled:CodeWhisperer_Example3.js')
                this.openNewTab(setting, predefinedCode)
            }
            this.codeInsertedJSComments = true
            vscode.workspace.onDidCloseTextDocument(e => {
                this.codeInsertedJSComments = false
            })
        } else if (name === 'javaScriptUnit') {
            if (!this.codeInsertedJSUnit) {
                const predefinedCode = `//////////////////////////////////////////// ${'\n'}// Try CodeWhisperer in this sandbox file // ${'\n'}//////////////////////////////////////////// ${'\n'}//${'\n'}// ====== Generate your first code suggestion ====== ${'\n'}// TODO: Prompt Amazon CodeWhisperer to generate a code suggestion for you. ${'\n'}// You can use the following code to generate a suggestion:"Function to upload a file to S3."${'\n'}${'\n'}// Function to upload a file to S3`
                const setting: vscode.Uri = vscode.Uri.parse('untitled:CodeWhisperer_Example4.js')
                this.openNewTab(setting, predefinedCode)
            }
            this.codeInsertedJSUnit = true
            vscode.workspace.onDidCloseTextDocument(e => {
                this.codeInsertedJSUnit = false
            })
        } else if (name === 'C#Auto') {
            if (!this.codeInsertedCAuto) {
                const predefinedCode = `############################################ ${'\n'} # Try CodeWhisperer in this sandbox file # ${'\n'}############################################ ${'\n'}#${'\n'}# ====== Generate your first code suggestion ====== ${'\n'}# TODO: Prompt Amazon CodeWhisperer to generate a code suggestion for you. ${'\n'}# You can use the following code to generate a suggestion:"Function to upload a file to S3."${'\n'}${'\n'}# Function to upload a file to S3`
                const setting: vscode.Uri = vscode.Uri.parse('untitled:CodeWhisperer_Example1.cs')
                this.openNewTab(setting, predefinedCode)
            }
            this.codeInsertedCAuto = true
            vscode.workspace.onDidCloseTextDocument(e => {
                this.codeInsertedCAuto = false
            })
        } else if (name === 'C#Manual') {
            if (!this.codeInsertedCManual) {
                const predefinedCode = `############################################ ${'\n'} # Try CodeWhisperer in this sandbox file # ${'\n'}############################################ ${'\n'}#${'\n'}# ====== Generate your first code suggestion ====== ${'\n'}# TODO: Prompt Amazon CodeWhisperer to generate a code suggestion for you. ${'\n'}# You can use the following code to generate a suggestion:"Function to upload a file to S3."${'\n'}${'\n'}# Function to upload a file to S3`
                const setting: vscode.Uri = vscode.Uri.parse('untitled:CodeWhisperer_Example2.cs')
                this.openNewTab(setting, predefinedCode)
            }
            this.codeInsertedCManual = true
            vscode.workspace.onDidCloseTextDocument(e => {
                this.codeInsertedCManual = false
            })
        } else if (name === 'C#Comments') {
            if (!this.codeInsertedCComments) {
                const predefinedCode = `############################################ ${'\n'} # Try CodeWhisperer in this sandbox file # ${'\n'}############################################ ${'\n'}#${'\n'}# ====== Generate your first code suggestion ====== ${'\n'}# TODO: Prompt Amazon CodeWhisperer to generate a code suggestion for you. ${'\n'}# You can use the following code to generate a suggestion:"Function to upload a file to S3."${'\n'}${'\n'}# Function to upload a file to S3`
                const setting: vscode.Uri = vscode.Uri.parse('untitled:CodeWhisperer_Example3.cs')
                this.openNewTab(setting, predefinedCode)
            }
            this.codeInsertedCComments = true
            vscode.workspace.onDidCloseTextDocument(e => {
                this.codeInsertedCComments = false
            })
        } else if (name === 'C#Unit') {
            if (!this.codeInsertedCUnit) {
                const predefinedCode = `############################################ ${'\n'} # Try CodeWhisperer in this sandbox file # ${'\n'}############################################ ${'\n'}#${'\n'}# ====== Generate your first code suggestion ====== ${'\n'}# TODO: Prompt Amazon CodeWhisperer to generate a code suggestion for you. ${'\n'}# You can use the following code to generate a suggestion:"Function to upload a file to S3."${'\n'}${'\n'}# Function to upload a file to S3`
                const setting: vscode.Uri = vscode.Uri.parse('untitled:CodeWhisperer_Example4.cs')
                this.openNewTab(setting, predefinedCode)
            }
            this.codeInsertedCUnit = true
            vscode.workspace.onDidCloseTextDocument(e => {
                this.codeInsertedCUnit = false
            })
        } else {
            vscode.window.showInformationMessage('This feature is not yet supported')
        }
    }

    public getOSType() {
        const platform = os.platform()
        if (platform === 'win32') {
            return 'Windows'
        } else if (platform === 'darwin') {
            return 'Mac'
        } else {
            return 'undefined'
        }
    }

    async openShortCuts(): Promise<void> {
        vscode.commands.executeCommand('workbench.action.openGlobalKeybindings', 'codewhisperer')
    }

    async openFeedBack(): Promise<void> {
        vscode.commands.executeCommand('aws.submitFeedbackCW')
    }

    //         ------   Telemetry   ------

    /** This represents the cause for the webview to open, whether a certain button was clicked or it opened automatically */
    #codeWhispererSource?: CodeWhispererSource

    setSource(source: CodeWhispererSource | undefined) {
        if (this.#codeWhispererSource) {
            return
        }
        this.#codeWhispererSource = source
    }

    emitUiClick(id: CodeWhispererUiClick) {
        telemetry.ui_click.emit({
            elementId: id,
        })
    }
}

//List of all events that are emitted from the webview
export type CodeWhispererUiClick =
    | 'cw_Resources_Documentation'
    | 'cw_Resources_Feedback'
    | 'cw_Shortcuts_KeyboardShortcutsEditor'
    | 'cw_ScanCode_LearnMore'
    | 'cw_GenerateSuggestions_LearnMore'
    | 'cw_GenerateSuggestions_Tab'
    | 'cw_GenerateSuggestions_TryExample'

const Panel = VueWebview.compilePanel(CodeWhispererWebview)
let activePanel: InstanceType<typeof Panel> | undefined
let subscriptions: vscode.Disposable[] | undefined

export type CodeWhispererSource = 'codewhispererDeveloperTools'

export async function showCodeWhispererWebview(
    ctx: vscode.ExtensionContext,
    source: CodeWhispererSource
): Promise<void> {
    activePanel ??= new Panel(ctx)
    activePanel.server.setSource(source)

    const webview = await activePanel!.show({
        title: localize('AWS.view.gettingStartedPage.title', `Learn how to CodeWhisperer`),
        viewColumn: isCloud9() ? vscode.ViewColumn.One : vscode.ViewColumn.Active,
    })

    if (!subscriptions) {
        subscriptions = [
            webview.onDidDispose(() => {
                vscode.Disposable.from(...(subscriptions ?? [])).dispose()
                activePanel = undefined
                subscriptions = undefined
            }),
        ]
    }
}
