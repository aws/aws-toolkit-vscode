/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Suggestion, SupportedCodingLanguages, SupportedCodingLanguagesExtensionToTypeMap } from './static'

/**
 * Finds the coding language if there is a match witnin the supported languages from context or body or from the title
 * @param suggestion SuggestionType
 * @returns string | undefined
 */
export const findLanguageFromSuggestion = (suggestion: Suggestion): string | undefined => {
    let res = suggestion.context.reduce((res: string | undefined, ctx: string): string | undefined => {
        if (res === undefined && SupportedCodingLanguages.includes(ctx)) {
            return ctx
        }
        return res
    }, undefined)

    if (res === undefined) {
        SupportedCodingLanguages.forEach(codingLang => {
            if (
                // eslint-disable-next-line no-null/no-null
                suggestion.title.match(new RegExp(codingLang, 'gi')) !== null ||
                // eslint-disable-next-line no-null/no-null
                suggestion.body.match(new RegExp(codingLang, 'gi')) !== null
            ) {
                res = codingLang
            }
        })
    }

    if (res === undefined) {
        res = getLanguageFromFileName(suggestion.title)
    }
    return res
}

type SupportedFileExtension = keyof typeof SupportedCodingLanguagesExtensionToTypeMap
/**
 * Finds the coding language if there is a match within the supported languages from the given file name
 * @param fileName string
 * @returns string | undefined
 */
export const getLanguageFromFileName = (fileName: string): string | undefined => {
    const fileExtension: SupportedFileExtension = fileName.split('.').pop() as SupportedFileExtension
    return SupportedCodingLanguagesExtensionToTypeMap[fileExtension] ?? undefined
}
