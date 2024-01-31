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

    private _inlineText: string | undefined = undefined

    getInlineDecoration(
        isSameLine: boolean = true,
        scrollable: boolean = true
    ): Partial<vscode.DecorationOptions> | undefined {
        console.log(`getInlineDecoration: ${isSameLine}`)
        const options = this.textOptions(isSameLine)
        console.log(options)
        if (!options) {
            console.log(`option is undefinedxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`)
            return undefined
        }

        const renderOptions: {
            renderOptions: vscode.ThemableDecorationRenderOptions
            hoverMessage: vscode.DecorationOptions['hoverMessage']
        } = {
            renderOptions: options,
            hoverMessage: this.onHover(),
        }

        return renderOptions
    }

    private textOptions(
        isSameLine: boolean,
        scrollable: boolean = true
    ): vscode.ThemableDecorationRenderOptions | undefined {
        const textOptions = {
            contentText: '',
            fontWeight: 'normal',
            fontStyle: 'normal',
            textDecoration: `none;${scrollable ? '' : ' position: absolute;'}`,
            color: '#8E8E8E',
        }

        if (isSameLine && this._inlineText) {
            console.log(`isSameline, will use previous text`)
            textOptions.contentText = this._inlineText
            return { after: textOptions }
        }

        if (!this._currentStep) {
            textOptions.contentText = 'CodeWhisperer suggests code as you type, press [TAB] to accept'

            console.log('set to 1')
            this._currentStep = '1'

            console.log('CodeWhisperer suggests code as you type, press [TAB] to accept')
        } else if (this._currentStep === '1') {
            textOptions.contentText = '[Option] + [C] triggers CodeWhisperer manually'
            console.log('[Option] + [C] triggers CodeWhisperer manually')

            this._currentStep = '2'
        } else if (this._currentStep === '2') {
            textOptions.contentText = `First CodeWhisperer suggestion accepted!`

            this._currentStep = '3'
        } else {
            //TODO: uncomment
            // return undefined

            textOptions.contentText = 'Congrat, you just finish CodeWhisperer tutorial!'
        }

        this._inlineText = textOptions.contentText

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
