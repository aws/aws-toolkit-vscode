/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vs from 'vscode'
import { QueryContext } from '../models/model'
import { extractLanguageAndOtherContext } from '../triggers/languages'
import { readImports } from './import-reader'

export async function extractContext(isCodeSelected: boolean): Promise<QueryContext> {
    const editor = vs.window.activeTextEditor
    const languageId = editor?.document?.languageId
    const { language, otherContext } = extractLanguageAndOtherContext(languageId)
    let should = otherContext
    const must = []
    if (language !== undefined) {
        if (isCodeSelected) {
            must.push(language)
        } else {
            should.push(language)
        }
    }
    if (editor !== undefined && languageId !== undefined) {
        const imports = await readImports(editor.document?.getText(), languageId)
        should.push(...imports)
    }

    should = [...new Set(should)]
    return {
        must,
        should,
        mustNot: [],
    }
}
