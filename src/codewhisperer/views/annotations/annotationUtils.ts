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

    get allDecorations() {
        return [this.cwLineHintDecoration, this.cwlineGutterDecoration, this.cwlineGutterDecorationColored]
    }

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

        const result: {
            decorationType: vscode.TextEditorDecorationType
            decorationOptions: vscode.DecorationOptions[] | vscode.Range[]
        }[] = []

        const range = editor.document.validateRange(
            new vscode.Range(lines[0].active, maxSmallIntegerV8, lines[0].active, maxSmallIntegerV8)
        )

        const inlineDecorationOptions = this.getInlineDecoration() as vscode.DecorationOptions | undefined
        const isCWRunning = RecommendationService.instance.isRunning

        if (!inlineDecorationOptions) {
            result.push({ decorationType: this.cwLineHintDecoration, decorationOptions: [] })
        } else {
            inlineDecorationOptions.range = range
            result.push({ decorationType: this.cwLineHintDecoration, decorationOptions: [inlineDecorationOptions] })
        }

        if (isCWRunning) {
            result.push({ decorationType: this.cwlineGutterDecoration, decorationOptions: [] })
            result.push({ decorationType: this.cwlineGutterDecorationColored, decorationOptions: [range] })
        } else {
            result.push({ decorationType: this.cwlineGutterDecoration, decorationOptions: [range] })
            result.push({ decorationType: this.cwlineGutterDecorationColored, decorationOptions: [] })
        }

        return result
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

    private getInlineDecoration(scrollable: boolean = true): Partial<vscode.DecorationOptions> | undefined {
        const options = this.textOptions()
        if (!options) {
            return undefined
        }

        const renderOptions: {
            renderOptions: vscode.ThemableDecorationRenderOptions
            hoverMessage: vscode.DecorationOptions['hoverMessage']
        } = {
            renderOptions: options,
            hoverMessage: this.onHover(),
        }

        if (this._currentStep === undefined) {
            this._currentStep = '1'
        } else if (this._currentStep === '1') {
            this._currentStep = '2'
        } else if (this._currentStep === '2') {
            this._currentStep = '3'
        } else {
            return undefined
        }

        return renderOptions
    }

    private textOptions(scrollable: boolean = true): vscode.ThemableDecorationRenderOptions | undefined {
        const textOptions = {
            contentText: '',
            fontWeight: 'normal',
            fontStyle: 'normal',
            textDecoration: `none;${scrollable ? '' : ' position: absolute;'}`,
            color: '#8E8E8E',
        }

        if (!this._currentStep) {
            textOptions.contentText = 'CodeWhisperer suggests code as you type, press [TAB] to accept'
        } else if (this._currentStep === '1') {
            textOptions.contentText = '[Option] + [C] triggers CodeWhisperer manually'
        } else if (this._currentStep === '2') {
            textOptions.contentText = `First CodeWhisperer suggestion accepted!`
        } else {
            return undefined
        }

        return { after: textOptions }
    }

    private onHover(): vscode.MarkdownString | undefined {
        if (this._currentStep === '2') {
            const source: CodeWhispererSource = 'vscodeComponent'
            const md = new vscode.MarkdownString(
                `[Learn more CodeWhisperer examples](command:aws.codeWhisperer.gettingStarted?${encodeURI(
                    JSON.stringify([placeholder, source])
                )})`
            )
            // to enable link to a declared command, need to set isTrusted = true
            md.isTrusted = true

            return md
        }

        return undefined
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
