/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { CodewhispererLanguage } from '../../shared/telemetry/telemetry.gen'
import { createConstantMap, ConstantMap } from '../../shared/utilities/tsUtils'
import * as codewhispererClient from '../client/codewhisperer'
import * as CodeWhispererConstants from '../models/constants'

export class RuntimeLanguageContext {
    /**
     * A map storing cwspr supporting programming language with key: vscLanguageId and value: cwsprLanguageId
     * Key: vscLanguageId
     * Value: CodeWhispererLanguageId
     */
    private supportedLanguageMap: ConstantMap<CodeWhispererConstants.SupportedLanguage, CodewhispererLanguage>
    private supportedLanguageSet = new Set<string>()

    constructor() {
        this.supportedLanguageMap = createConstantMap<CodeWhispererConstants.SupportedLanguage, CodewhispererLanguage>({
            java: 'java',
            python: 'python',
            javascriptreact: 'jsx',
            typescript: 'javascript',
            javascript: 'javascript',
        })

        const values = Array.from(this.supportedLanguageMap.values())
        const keys = Array.from(this.supportedLanguageMap.keys())
        values.forEach(item => this.supportedLanguageSet.add(item))
        keys.forEach(item => this.supportedLanguageSet.add(item))
    }

    // transform a given vscodeLanguageId into CodewhispererLanguage if exists, otherwise fallback to plaintext
    public getLanguageContext(vscLanguageId?: string): { language: CodewhispererLanguage } {
        const cwsprLanguage: CodewhispererLanguage | undefined = this.supportedLanguageMap.get(vscLanguageId)
        if (!cwsprLanguage) {
            return { language: 'plaintext' }
        } else {
            return { language: cwsprLanguage }
        }
    }

    /**
     *
     * @param vscLanguageId : official vscode languageId
     * @returns corresponding cwspr languageId if any, otherwise fallback to vscLanguageId
     */
    public mapVscLanguageToCodeWhispererLanguage(vscLanguageId?: string): string | undefined {
        return this.supportedLanguageMap.get(vscLanguageId) ?? undefined
    }

    /**
     * Mapping the field ProgrammingLanguage of codewhisperer generateRecommendationRequest | listRecommendationRequest to
     * its Codewhisperer runtime language e.g. jsx -> typescript, typescript -> typescript
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
            case 'typescript':
                parentLanguage = { languageName: CodeWhispererConstants.javascript }
                break
            case 'jsx':
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

    /**
     *
     * @param languageId: either vscodeLanguageId or CodewhispererLanguage
     * @returns ture if the language is supported by CodeWhisperer otherwise false
     */
    public isLanguageSupported(languageId: string): boolean {
        return this.supportedLanguageSet.has(languageId)
    }
}

export const runtimeLanguageContext = new RuntimeLanguageContext()
