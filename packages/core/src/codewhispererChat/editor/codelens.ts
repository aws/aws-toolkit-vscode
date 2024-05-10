/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import vscode from 'vscode'
import globals from '../../shared/extensionGlobals'
import { ToolkitError } from '../../shared/errors'
import { Commands, placeholder } from '../../shared/vscode/commands2'
import { platform } from 'os'
import { focusAmazonQPanel } from '../commands/registerCommands'
import { AuthStates, AuthUtil } from '../../codewhisperer/util/authUtil'

/** When the user clicks the CodeLens that prompts user to try Amazon Q chat */
export const tryChatCodeLensCommand = Commands.declare(`_aws.amazonq.tryChatCodeLens`, () => async () => {
    await focusAmazonQPanel.execute(placeholder, 'codeLens')
})

/**
 * As part of hinting at users to use Amazon Q Chat, we will show codelenses
 * prompting them a certain amount of time/uses. Then after
 * a certain amount of times we will never show it again.
 *
 * This codelens appears above every clicked line.
 */
export class TryChatCodeLensProvider implements vscode.CodeLensProvider {
    private _onDidChangeCodeLenses = new vscode.EventEmitter<void>()
    onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event

    /** How many times we've shown the CodeLens */
    private count: number = 0
    /** How many times we want to show the CodeLens */
    static readonly maxCount = 10
    static readonly debounceMillis: number = 700
    static readonly showCodeLensId = `aws.amazonq.showTryChatCodeLens`

    private static providerDisposable: vscode.Disposable | undefined = undefined
    private disposables: vscode.Disposable[] = []

    constructor(private readonly cursorPositionIfValid = () => TryChatCodeLensProvider._resolveCursorPosition()) {
        // when we want to recalculate the codelens
        this.disposables.push(
            vscode.window.onDidChangeActiveTextEditor(() => this._onDidChangeCodeLenses.fire()),
            vscode.window.onDidChangeTextEditorSelection(() => this._onDidChangeCodeLenses.fire())
        )
    }

    static async register(): Promise<boolean> {
        const shouldShow = globals.context.globalState.get(this.showCodeLensId, true)
        if (!shouldShow) {
            return false
        }

        if (this.providerDisposable) {
            throw new ToolkitError(`${this.name} can only be registered once.`)
        }

        const provider = new TryChatCodeLensProvider()
        this.providerDisposable = vscode.languages.registerCodeLensProvider({ scheme: 'file' }, provider)
        globals.context.subscriptions.push(provider)
        return true
    }

    provideCodeLenses(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.CodeLens[]> {
        return new Promise(resolve => {
            token.onCancellationRequested(() => resolve([]))

            if (AuthUtil.instance.getChatAuthStateSync().amazonQ !== AuthStates.connected) {
                return resolve([])
            }

            if (this.count >= TryChatCodeLensProvider.maxCount) {
                // We only want to show this code lens a certain amount of times
                // to not annoy customers. The following ensures it is never shown again.
                this.dispose()
                return resolve([])
            }

            // We use a timeout as a leading debounce so that the user must
            // wait on a specific line for a certain amount of time until we show the codelens.
            // This prevents spamming code lenses if the user changes multiple lines quickly.
            globals.clock.setTimeout(() => {
                const position = this.cursorPositionIfValid()
                if (token.isCancellationRequested || position === undefined) {
                    return resolve([])
                }

                resolve([
                    {
                        range: new vscode.Range(position, position),
                        isResolved: true,
                        command: {
                            command: tryChatCodeLensCommand.id,
                            title: `Amazon Q: open chat with (${resolveModifierKey()} + i) - showing ${
                                TryChatCodeLensProvider.maxCount - this.count
                            } more times`,
                        },
                    },
                ])

                this.count++
            }, TryChatCodeLensProvider.debounceMillis)
        })
    }

    /**
     * Resolves the current cursor position in the active document
     * if the criteria are met.
     */
    private static _resolveCursorPosition(): vscode.Position | undefined {
        const activeEditor = vscode.window.activeTextEditor
        const activeDocument = activeEditor?.document
        const textSelection = activeEditor?.selection
        if (
            !activeEditor ||
            !activeDocument ||
            activeEditor.selections.length > 1 || // is multi-cursor select
            !textSelection?.isSingleLine ||
            activeDocument.lineAt(textSelection.start.line).text.length === 0 // is empty line
        ) {
            return undefined
        }

        return textSelection.start
    }

    dispose() {
        void globals.context.globalState.update(TryChatCodeLensProvider.showCodeLensId, false)
        TryChatCodeLensProvider.providerDisposable?.dispose()
        this.disposables.forEach(d => d.dispose())
    }
}

export function resolveModifierKey() {
    const platformName = platform()
    switch (platformName) {
        case 'win32':
            return 'ctrl'
        case 'linux':
            return 'meta'
        case 'darwin':
            return 'cmd'
        default:
            return 'ctrl'
    }
}
