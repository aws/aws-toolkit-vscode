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

/*
 * Method to render the edit suggestion as an SVG image
 * @param item - The edit suggestion
 * @param editor - The active text editor
 * @param session - The current session
 * @param languageClient - The language client
 * @returns A promise that resolves to true if the image is rendered successfully, false otherwise
 */
export async function showEdits(
    item: InlineCompletionItemWithReferences,
    editor: vscode.TextEditor | undefined,
    session: CodeWhispererSession,
    languageClient: LanguageClient
): Promise<boolean> {
    if (!editor) {
        return false
    }
    try {
        const svgGenerationService = new SvgGenerationService()
        // Generate your SVG image with the file contents
        const currentFile = editor.document.uri.fsPath
        const { svgImage, startLine, newCode, originalCodeHighlightRange } = await svgGenerationService.generateDiffSvg(
            currentFile,
            item.insertText as string
        )

        // TODO: To investigate why it fails and patch [generateDiffSvg]
        if (newCode.length === 0) {
            getLogger('nextEditPrediction').warn('not able to apply provided edit suggestion, skip rendering')
            return false
        }

        if (svgImage) {
            // display the SVG image
            await displaySvgDecoration(
                editor,
                svgImage,
                startLine,
                newCode,
                originalCodeHighlightRange,
                session,
                languageClient,
                item
            )
            return true
        } else {
            getLogger('nextEditPrediction').error('SVG image generation returned an empty result.')
            return false
        }
    } catch (error) {
        getLogger('nextEditPrediction').error(`Error generating SVG image: ${error}`)
        return false
    }
}
