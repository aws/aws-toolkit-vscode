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
    const should = otherContext
    const must = new Set<string>()
    if (language !== undefined) {
        if (isCodeSelected) {
            must.add(language)
        } else {
            should.add(language)
        }
    }

    if (editor !== undefined && languageId !== undefined) {
        const imports = await readImports(editor.document?.getText(), languageId)
        imports
            .filter(function (elem, index, self) {
                return index === self.indexOf(elem) && elem != languageId
            })
            .forEach(importKey => should.add(importKey))
    }

    return {
        must: Array.from(must),
        should: Array.from(should),
        mustNot: [],
    }
}
