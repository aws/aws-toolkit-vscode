/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getIcon } from '../../../shared/icons'
import { LineSelection } from './lineTracker'
import { CodeWhispererSource } from '../../commands/types'
import { placeholder } from '../../../shared/vscode/commands2'
import { RecommendationService } from '../../service/recommendationService'

const maxSmallIntegerV8 = 2 ** 30 // Max number that can be stored in V8's smis (small integers)

const gutterColored = 'aws-codewhisperer-editor-gutter'
const gutterWhite = 'aws-codewhisperer-editor-gutter-white'

export class InlineDecorator {
    // TODO: persist this value and read from the cache
    private _currentStep: '1' | '2' | '3' | undefined = undefined

    readonly cwLineHintDecoration: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType({
        after: {
            margin: '0 0 0 3em',
            textDecoration: 'none',
        },
        rangeBehavior: vscode.DecorationRangeBehavior.OpenOpen,
    })

    readonly cwlineGutterDecoration = vscode.window.createTextEditorDecorationType({
        gutterIconPath: iconPathToUri(getIcon(gutterWhite)),
    })

    readonly cwlineGutterDecorationColored = vscode.window.createTextEditorDecorationType({
        gutterIconPath: iconPathToUri(getIcon(gutterColored)),
    })

    onLineChangeDecorations(
        editor: vscode.TextEditor,
        lines: LineSelection[]
    ): {
        decorationType: vscode.TextEditorDecorationType
        decorationOptions: vscode.DecorationOptions[] | vscode.Range[]
    }[] {
        if (lines.length === 0) {
            return [
                { decorationType: this.cwLineHintDecoration, decorationOptions: [] },
                { decorationType: this.cwlineGutterDecoration, decorationOptions: [] },
                { decorationType: this.cwlineGutterDecorationColored, decorationOptions: [] },
            ]
        }

        const inlineDecorationOptions = this.getInlineDecoration() as vscode.DecorationOptions
        const range = editor.document.validateRange(
            new vscode.Range(lines[0].active, maxSmallIntegerV8, lines[0].active, maxSmallIntegerV8)
        )
        inlineDecorationOptions.range = range

        const isCWRunning = RecommendationService.instance.isRunning

        if (isCWRunning) {
            return [
                { decorationType: this.cwLineHintDecoration, decorationOptions: [inlineDecorationOptions] },
                { decorationType: this.cwlineGutterDecoration, decorationOptions: [] },
                { decorationType: this.cwlineGutterDecorationColored, decorationOptions: [range] },
            ]
        } else {
            return [
                { decorationType: this.cwLineHintDecoration, decorationOptions: [inlineDecorationOptions] },
                { decorationType: this.cwlineGutterDecoration, decorationOptions: [range] },
                { decorationType: this.cwlineGutterDecorationColored, decorationOptions: [] },
            ]
        }
    }

    onSuggestionActionDecorations(
        editor: vscode.TextEditor,
        lines: LineSelection[]
    ): {
        decorationType: vscode.TextEditorDecorationType
        decorationOptions: vscode.DecorationOptions[] | vscode.Range[]
    }[] {
        console.log(`onSuggestionActionDecorations!`)
        if (lines.length === 0) {
            return [
                { decorationType: this.cwLineHintDecoration, decorationOptions: [] },
                { decorationType: this.cwlineGutterDecoration, decorationOptions: [] },
                { decorationType: this.cwlineGutterDecorationColored, decorationOptions: [] },
            ]
        }

        const range = editor.document.validateRange(
            new vscode.Range(lines[0].active, maxSmallIntegerV8, lines[0].active, maxSmallIntegerV8)
        )

        const isCWRunning = RecommendationService.instance.isRunning

        if (isCWRunning) {
            return [
                { decorationType: this.cwLineHintDecoration, decorationOptions: [] },
                { decorationType: this.cwlineGutterDecoration, decorationOptions: [] },
                { decorationType: this.cwlineGutterDecorationColored, decorationOptions: [range] },
            ]
        }

        return [
            { decorationType: this.cwLineHintDecoration, decorationOptions: [] },
            { decorationType: this.cwlineGutterDecoration, decorationOptions: [range] },
            { decorationType: this.cwlineGutterDecorationColored, decorationOptions: [] },
        ]
    }

    private getInlineDecoration(scrollable: boolean = true): Partial<vscode.DecorationOptions> {
        const source: CodeWhispererSource = 'vscodeComponent'
        const md = new vscode.MarkdownString(
            `[Learn more CodeWhisperer examples](command:aws.codeWhisperer.gettingStarted?${encodeURI(
                JSON.stringify([placeholder, source])
            )})`
        )

        md.isTrusted = true

        let contentText: string = ''
        if (this._currentStep === undefined) {
            contentText = 'CodeWhisperer suggests code as you type, press [TAB] to accept'

            this._currentStep = '1'
        } else if (this._currentStep === '1') {
            contentText = '[Option] + [C] triggers CodeWhisperer manually'

            this._currentStep = '2'
        } else if (this._currentStep === '2') {
            contentText = `First CodeWhisperer suggestion accepted!`

            this._currentStep = '3'
        } else {
            contentText = 'Congrat! You finish CodeWhisperer tutorial' //TODO: remove it
        }

        return {
            renderOptions: {
                after: {
                    contentText: contentText,
                    fontWeight: 'normal',
                    fontStyle: 'normal',
                    textDecoration: `none;${scrollable ? '' : ' position: absolute;'}`,
                    color: '#8E8E8E',
                },
            },
            hoverMessage: md,
        }
    }
}

// TODO: better way to do this?
function iconPathToUri(iconPath: any): vscode.Uri | undefined {
    let result: vscode.Uri | undefined = undefined
    if (iconPath.dark) {
        if (iconPath.dark.Uri) {
            result = iconPath.dark.Uri
            return result
        }
    }

    if (iconPath.light) {
        if (iconPath.light.Uri) {
            result = iconPath.light.Uri
            return result
        }
    }

    if (iconPath.source) {
        result = iconPath.source
        return result
    }

    return result
}
