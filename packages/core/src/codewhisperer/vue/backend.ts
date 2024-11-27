/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()
import * as os from 'os'
import * as vscode from 'vscode'
import * as path from 'path'
import { VueWebview } from '../../webviews/main'
import { isCloud9 } from '../../shared/extensionUtilities'
import globals from '../../shared/extensionGlobals'
import { telemetry, CodewhispererLanguage, CodewhispererGettingStartedTask } from '../../shared/telemetry/telemetry'
import { fs } from '../../shared'
import { getLogger } from '../../shared/logger'
import { AmazonQPromptSettings } from '../../shared/settings'
import { CodeWhispererSource } from '../commands/types'
import { submitFeedback } from '../../feedback/vue/submitFeedback'
import { placeholder } from '../../shared/vscode/commands2'

export type OSType = 'Mac' | 'RestOfOS'
export class CodeWhispererWebview extends VueWebview {
    public static readonly sourcePath: string = 'src/codewhisperer/vue/index.js'
    public readonly id = 'CodeWhispererWebview'

    public constructor() {
        super(CodeWhispererWebview.sourcePath)
    }

    private isFileSaved: boolean = false
    private getLocalFilePath(fileName: string): string {
        // This will store the files in the global storage path of VSCode
        return path.join(globals.context.globalStorageUri.fsPath, fileName)
    }

    // This function opens TypeScript/JavaScript/Python/Java/C# file in the editor.
    async openFile(name: [fileName: string, fileContent: string]): Promise<void> {
        const fileName = name[0]
        const fileContent = name[1]

        const localFilePath = this.getLocalFilePath(fileName)
        if ((await fs.existsFile(localFilePath)) && this.isFileSaved) {
            const fileUri = vscode.Uri.file(localFilePath)
            await vscode.workspace.openTextDocument(fileUri).then(async (doc) => {
                await vscode.window.showTextDocument(doc, vscode.ViewColumn.Active).then((editor) => {
                    const endOfDocument = new vscode.Position(
                        doc.lineCount - 1,
                        doc.lineAt(doc.lineCount - 1).text.length
                    )
                    editor.selection = new vscode.Selection(endOfDocument, endOfDocument)
                })
            })
        } else {
            await this.saveFileLocally(localFilePath, fileContent)
        }
    }

    // This function saves and open the file in the editor.
    private async saveFileLocally(localFilePath: string, fileContent: string): Promise<void> {
        try {
            await fs.writeFile(localFilePath, fileContent)
            this.isFileSaved = true
            // Opening the text document
            await vscode.workspace.openTextDocument(localFilePath).then(async (doc) => {
                await vscode.window.showTextDocument(doc, vscode.ViewColumn.Active).then((editor) => {
                    // Set the selection to the end of the document
                    const endOfDocument = new vscode.Position(
                        doc.lineCount - 1,
                        doc.lineAt(doc.lineCount - 1).text.length
                    )
                    editor.selection = new vscode.Selection(endOfDocument, endOfDocument)
                })
            })
        } catch (error) {
            void vscode.window.showErrorMessage(
                localize(
                    'AWS.message.error.codewhispererLearnPage.saveFileLocally',
                    'There was an error in saving the file, check log for details.'
                )
            )
        }
    }

    // This function returns the OS type of the machine used in Shortcuts and Generate Suggestion Sections
    public getOSType(): OSType {
        return os.platform() === 'darwin' ? 'Mac' : 'RestOfOS'
    }

    // This function opens the Keyboard shortcuts in VSCode
    async openShortCuts(): Promise<void> {
        await vscode.commands.executeCommand('workbench.action.openGlobalKeybindings', 'codewhisperer')
    }

    // This function opens the Feedback CodeWhisperer page in the webview
    async openFeedBack(): Promise<void> {
        return submitFeedback(placeholder, 'Amazon Q')
    }

    // ------Telemetry------
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
            passive: true,
        })
    }
    // Telemetry for CodeWhisperer Try Example with two params Language and Task Type
    emitTryExampleClick(languageSelected: CodewhispererLanguage, taskType: CodewhispererGettingStartedTask) {
        telemetry.codewhisperer_onboardingClick.emit({
            codewhispererLanguage: languageSelected,
            codewhispererGettingStartedTask: taskType,
        })
    }
}
// List of all events that are emitted from the webview of CodeWhisperer
export type CodeWhispererUiClick =
    | 'codewhisperer_Resources_Documentation'
    | 'codewhisperer_Resources_Feedback'
    | 'codewhisperer_Prompt_Eng'
    | 'codewhisperer_Commands_KeyboardShortcutsEditor'
    | 'codewhisperer_ScanCode_LearnMore'
    | 'codewhisperer_GenerateSuggestions_LearnMore'
    | 'codewhisperer_Learn_PageOpen'

const Panel = VueWebview.compilePanel(CodeWhispererWebview)
let activePanel: InstanceType<typeof Panel> | undefined
let subscriptions: vscode.Disposable[] | undefined

// This function is called when the extension is activated : Webview of CodeWhisperer
export async function showCodeWhispererWebview(
    ctx: vscode.ExtensionContext,
    source: CodeWhispererSource | undefined
): Promise<void> {
    activePanel ??= new Panel(ctx)
    activePanel.server.setSource(source)
    if (activePanel === undefined) {
        getLogger().error(`codewhisperer: failed to load Learn CodeWhisperer Page`)
        return
    }
    const webview = await activePanel!.show({
        title: localize('AWS.view.gettingStartedPage.title', `Learn Amazon Q`),
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
        const prompts = AmazonQPromptSettings.instance
        // To check the condition If the user has already seen the welcome message
        if (await prompts.isPromptEnabled('codeWhispererNewWelcomeMessage')) {
            telemetry.ui_click.emit({ elementId: 'codewhisperer_Learn_PageOpen', passive: true })
        } else {
            telemetry.ui_click.emit({ elementId: 'codewhisperer_Learn_PageOpen', passive: false })
        }
    }
}
