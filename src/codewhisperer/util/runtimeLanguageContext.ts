/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { CodewhispererLanguage } from '../../shared/telemetry/telemetry.gen'
import { CodeWhispererConstants } from '../models/constants'
import * as codewhispererClient from '../client/codewhisperer'

interface RuntimeLanguageContextData {
    /**
     * collection of all language runtime versions
     */
    languageContexts: {
        [language in CodewhispererLanguage as string]: {
            /**
             * the language of the current file
             */
            language: CodewhispererLanguage
        }
    }
}

export class RuntimeLanguageContext {
    private runtimeLanguageContext: RuntimeLanguageContextData = {
        languageContexts: {
            ['plaintext']: {
                language: 'plaintext',
            },
            ['java']: {
                language: 'java',
            },
            ['python']: {
                language: 'python',
            },
            ['javascript']: {
                language: 'javascript',
            },
        },
    }

    public getLanguageContext(languageId?: string) {
        const languageName = this.convertLanguage(languageId)
        if (languageName in this.runtimeLanguageContext.languageContexts) {
            return this.runtimeLanguageContext.languageContexts[languageName]
        }
        return {
            language: languageName as CodewhispererLanguage,
        }
    }

    public convertLanguage(languageId?: string): string {
        if (!languageId) return CodeWhispererConstants.plaintext
        let mappedId = CodeWhispererConstants.vscLanguageIdToCodeWhispererLanguage.get(languageId) as string
        if (!mappedId) {
            mappedId = languageId
        }

        return mappedId
    }

    /**
     * This method should be called right before calling cwspr API to map some language dialet
     * e.g. jsx(javascriptreact), typescript into javascript
     * while keeping the source language name (jsx, typescript here) in client side as we send telemetry metrics with its source language name
     */
    public covertCwsprRequest<
        T extends codewhispererClient.ListRecommendationsRequest | codewhispererClient.GenerateRecommendationsRequest
    >(request: T): T {
        const fileContext = request.fileContext
        const childLanguage = request.fileContext.programmingLanguage
        let parentLanguage: codewhispererClient.ProgrammingLanguage
        switch (childLanguage.languageName) {
            case CodeWhispererConstants.typescript:
                parentLanguage = { languageName: CodeWhispererConstants.javascript }
                break
            case CodeWhispererConstants.vscJsx:
                parentLanguage = { languageName: CodeWhispererConstants.javascript }
                break
            default:
                parentLanguage = childLanguage
                break
        }

        return {
            ...request,
            fileContext: {
                ...fileContext,
                programmingLanguage: parentLanguage,
            },
        }
    }

    public isLanguageSupported(languageId: string): boolean {
        return CodeWhispererConstants.supportedLanguages.includes(languageId)
    }
}

export const runtimeLanguageContext = new RuntimeLanguageContext()
