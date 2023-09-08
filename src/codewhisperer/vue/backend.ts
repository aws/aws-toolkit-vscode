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

    public constructor(private readonly start: string) {
        super()
    }
    //This function is called when the extension is activated to check whether is it the first time the user is using the extension or not
    public async showAtStartUp(): Promise<string | void> {
        return this.start
    }

    // private override  context?: vscode.ExtensionContext
    //This function opens the new created Documents in a new editor tab
    async openNewEditorTab(fileName: vscode.Uri, defaultCode: string): Promise<void> {
        vscode.workspace.openTextDocument(fileName).then((a: vscode.TextDocument) => {
            vscode.window.showTextDocument(a, 1, false).then(e => {
                e.edit(edit => {
                    edit.insert(new vscode.Position(0, 0), defaultCode)
                })
            })
        })
    }

    //This function opens the document in the editor with the predefined code in it
    async openFile(name: string[]): Promise<void> {
        // let document: vscode.TextDocument | undefined = undefined
        const fileName = name[0]
        const fileContent = name[1]
        const existingDocument = vscode.workspace.textDocuments.find(
            doc =>
                doc.uri.toString() === `untitled:${fileName}` ||
                doc.uri.toString() ===
                    vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, fileName).toString()
        )
        if (existingDocument) {
            vscode.window.showTextDocument(existingDocument, vscode.ViewColumn.Active)
        } else {
            //         const fileUri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, fileName)
            const fileNameUri = vscode.Uri.parse(`untitled:${fileName}`)
            this.openNewEditorTab(fileNameUri, fileContent)
        }
    }

    //This function returns the OS type of the machine used in Shortcuts and Generate Suggestion Sections
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

    //This function opens the Keyboard shortcuts in VSCode
    async openShortCuts(): Promise<void> {
        vscode.commands.executeCommand('workbench.action.openGlobalKeybindings', 'codewhisperer')
    }

    //This function opens the Feedback CW page in the webview
    async openFeedBack(): Promise<void> {
        vscode.commands.executeCommand('aws.submitFeedback', 'CodeWhisperer')
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

//List of all events that are emitted from the webview of CodeWhisperer
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

// This function is called when the extension is activated : Webview of CodeWhisperer
export async function showCodeWhispererWebview(
    ctx: vscode.ExtensionContext,
    source: CodeWhispererSource,
    start: string
): Promise<void> {
    activePanel ??= new Panel(ctx, start) // "start" Parameter is passed to the constructor of CodeWhispererWebview to seperate the user experience from first time user to regualr signIn user
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
