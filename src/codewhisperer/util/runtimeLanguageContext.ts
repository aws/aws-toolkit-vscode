/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { CodewhispererLanguage } from '../../shared/telemetry/telemetry.gen'
import { createConstantMap } from '../../shared/utilities/tsUtils'
import * as codewhispererClient from '../client/codewhisperer'
import * as CodeWhispererConstants from '../models/constants'

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
    private supportedLanguageMap = createConstantMap<CodeWhispererConstants.SupportedLanguage, CodewhispererLanguage>({
        java: 'java',
        python: 'python',
        javascriptreact: 'jsx',
        typescript: 'javascript',
        javascript: 'javascript',
    })

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
        const languageName = this.mapVscLanguageToCodeWhispererLanguage(languageId)
        if (languageName in this.runtimeLanguageContext.languageContexts) {
            return this.runtimeLanguageContext.languageContexts[languageName]
        }
        return {
            language: languageName as CodewhispererLanguage,
        }
    }

    public mapVscLanguageToCodeWhispererLanguage(vscLanguageId?: string): string {
        if (!vscLanguageId) return CodeWhispererConstants.plaintext
        return this.supportedLanguageMap.get(vscLanguageId) ?? vscLanguageId
    }

    /**
     * Mapping the field ProgrammingLanguage of codewhisperer generateRecommendationRequest | listRecommendationRequest to
     * its cwspr runtime language e.g. jsx -> typescript, typescript -> typescript
     * @param request : cwspr generateRecommendationRequest | ListRecommendationRequest
     * @returns request with source language name mapped to cwspr runtime language
     */
    public mapToRuntimeLanguage<
        T extends codewhispererClient.ListRecommendationsRequest | codewhispererClient.GenerateRecommendationsRequest
    >(request: T): T {
        const fileContext = request.fileContext
        const childLanguage = request.fileContext.programmingLanguage
        let parentLanguage: codewhispererClient.ProgrammingLanguage
        switch (childLanguage.languageName) {
            case CodeWhispererConstants.vscodeLanguageId.typescript:
                parentLanguage = { languageName: CodeWhispererConstants.javascript }
                break
            case CodeWhispererConstants.vscodeLanguageId.jsx:
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

    public isLanguageSupported(vscLanguageId: string): boolean {
        return this.supportedLanguageMap.has(vscLanguageId)
    }
}

export const runtimeLanguageContext = new RuntimeLanguageContext()
