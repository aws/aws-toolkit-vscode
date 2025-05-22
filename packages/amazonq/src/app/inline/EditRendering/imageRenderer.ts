/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { displaySvgDecoration } from './displayImage'
import { SvgGenerationService } from './svgGenerator'
import { getLogger } from 'aws-core-vscode/shared'

export async function showEdits(edits: string, editor: vscode.TextEditor | undefined) {
    if (!editor) {
        return
    }
    try {
        const svgGenerationService = new SvgGenerationService()
        // Generate your SVG image with the file contents ?
        const originalCode = editor.document.getText()
        const { svgImage, startLine, newCode } = await svgGenerationService.generateDiffSvg(originalCode, edits)

        if (svgImage) {
            // display the SVG image
            await displaySvgDecoration(editor, svgImage, startLine, newCode)
        } else {
            getLogger('nextEditPrediction').error('SVG image generation returned an empty result.')
        }
    } catch (error) {
        getLogger('nextEditPrediction').error(`Error generating SVG image: ${error}`)
    }
}
