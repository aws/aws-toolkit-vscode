/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TextDocument } from 'vscode'
import { extractLanguageNameFromFile, extractAdditionalLanguageMatchPoliciesFromFile } from './languages'
import { MatchPolicy } from '../../../clients/chat/v0/model'
import { readImports } from './importReader'
import { FileContext } from './model'

export class FileContextExtractor {
    public async extract(file: TextDocument): Promise<FileContext> {
        const fileText = file.getText()
        const fileLanguage = extractLanguageNameFromFile(file)
        const filePath = file.fileName
        const matchPolicy = await this.extractMatchPolicyFromFile(file, false)

        return {
            fileText,
            fileLanguage,
            filePath,
            matchPolicy,
        }
    }

    private async extractMatchPolicyFromFile(file: TextDocument, isCodeSelected: boolean): Promise<MatchPolicy> {
        const languageId = file.languageId

        const language = extractLanguageNameFromFile(file)
        const additionalLanguageContext = extractAdditionalLanguageMatchPoliciesFromFile(file)
        const should = additionalLanguageContext
        const must = new Set<string>()
        if (language !== undefined) {
            if (isCodeSelected) {
                must.add(language)
            } else {
                should.add(language)
            }
        }

        if (languageId !== undefined) {
            const imports = await readImports(file.getText(), languageId)
            imports
                .filter(function (elem, index, self) {
                    return index === self.indexOf(elem) && elem !== languageId
                })
                .forEach(importKey => should.add(importKey))
        }

        return {
            must: Array.from(must),
            should: Array.from(should),
            mustNot: [],
        }
    }
}
