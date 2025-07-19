/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { displaySvgDecoration } from './displayImage'
import { SvgGenerationService } from './svgGenerator'
import { getLogger } from 'aws-core-vscode/shared'
import { LanguageClient } from 'vscode-languageclient'
import { InlineCompletionItemWithReferences } from '@aws/language-server-runtimes/protocol'
import { CodeWhispererSession } from '../sessionManager'
import { AmazonQInlineCompletionItemProvider } from '../completion'

export async function showEdits(
    item: InlineCompletionItemWithReferences,
    editor: vscode.TextEditor | undefined,
    session: CodeWhispererSession,
    languageClient: LanguageClient,
    inlineCompletionProvider?: AmazonQInlineCompletionItemProvider
) {
    if (!editor) {
        return
    }
    try {
        const svgGenerationService = new SvgGenerationService()
        // Generate your SVG image with the file contents
        const currentFile = editor.document.uri.fsPath
        const { svgImage, startLine, newCode, origionalCodeHighlightRange } =
            await svgGenerationService.generateDiffSvg(currentFile, item.insertText as string)

        if (svgImage) {
            // display the SVG image
            await displaySvgDecoration(
                editor,
                svgImage,
                startLine,
                newCode,
                origionalCodeHighlightRange,
                session,
                languageClient,
                item,
                inlineCompletionProvider
            )
        } else {
            getLogger('nextEditPrediction').error('SVG image generation returned an empty result.')
        }
    } catch (error) {
        getLogger('nextEditPrediction').error(`Error generating SVG image: ${error}`)
    }
}
