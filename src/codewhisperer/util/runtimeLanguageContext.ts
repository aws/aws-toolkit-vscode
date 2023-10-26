/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger } from '../../shared/logger/logger'
import { CodewhispererLanguage } from '../../shared/telemetry/telemetry.gen'
import { createConstantMap, ConstantMap } from '../../shared/utilities/tsUtils'
import * as codewhispererClient from '../client/codewhisperer'
import * as CodeWhispererConstants from '../models/constants'

type RuntimeLanguage = Exclude<CodewhispererLanguage, 'jsx' | 'tsx'>

const runtimeLanguageSet: ReadonlySet<RuntimeLanguage> = new Set([
    'c',
    'cpp',
    'csharp',
    'go',
    'java',
    'javascript',
    'kotlin',
    'php',
    'python',
    'ruby',
    'rust',
    'scala',
    'shell',
    'sql',
    'typescript',
])

export class RuntimeLanguageContext {
    /**
     * Key: Union set of CodewhispererLanguageId and PlatformLanguageId (VSC, C9 etc.)
     * Value: CodeWhispererLanguageId
     */
    private supportedLanguageMap: ConstantMap<
        CodeWhispererConstants.PlatformLanguageId | CodewhispererLanguage,
        CodewhispererLanguage
    >

    /**
     * A map storing CodeWhisperer supported programming language with key: vscLanguageId and value: language extension
     * Key: vscLanguageId
     * Value: language extension
     */
    private supportedLanguageExtensionMap: ConstantMap<CodewhispererLanguage, string>

    constructor() {
        this.supportedLanguageMap = createConstantMap<
            CodeWhispererConstants.PlatformLanguageId | CodewhispererLanguage,
            CodewhispererLanguage
        >({
            c: 'c',
            cpp: 'cpp',
            csharp: 'csharp',
            c_cpp: 'cpp',
            go: 'go',
            java: 'java',
            javascript: 'javascript',
            javascriptreact: 'jsx',
            jsx: 'jsx',
            kotlin: 'kotlin',
            plaintext: 'plaintext',
            php: 'php',
            python: 'python',
            ruby: 'ruby',
            rust: 'rust',
            scala: 'scala',
            sh: 'shell',
            shell: 'shell',
            shellscript: 'shell',
            sql: 'sql',
            tsx: 'tsx',
            typescript: 'typescript',
            typescriptreact: 'tsx',
            golang: 'go',
        })
        this.supportedLanguageExtensionMap = createConstantMap<CodewhispererLanguage, string>({
            c: 'c',
            cpp: 'cpp',
            csharp: 'cs',
            go: 'go',
            java: 'java',
            javascript: 'js',
            jsx: 'jsx',
            kotlin: 'kt',
            plaintext: 'txt',
            php: 'php',
            python: 'py',
            ruby: 'rb',
            rust: 'rs',
            scala: 'scala',
            shell: 'sh',
            sql: 'sql',
            tsx: 'tsx',
            typescript: 'ts',
        })
    }

    /**
     * To add a new platform language id:
     * 1. add new platform language ID constant in the file codewhisperer/constant.ts
     * 2. add corresponding CodeWhispererLanguage mapping in the constructor of RuntimeLanguageContext
     * @param languageId : vscode language id or codewhisperer language name
     * @returns normalized language id of type CodewhispererLanguage if any, otherwise undefined
     */
    public normalizeLanguage(languageId?: string): CodewhispererLanguage | undefined {
        return this.supportedLanguageMap.get(languageId)
    }

    /**
     * Normalize client side language id to service aware language id (service is not aware of jsx/tsx)
     * Only used when invoking CodeWhisperer service API, for client usage please use normalizeLanguage
     * Client side CodewhispererLanguage is a superset of NormalizedLanguageId
     */
    public toRuntimeLanguage(language: CodewhispererLanguage): RuntimeLanguage {
        switch (language) {
            case 'jsx':
                return 'javascript'

            case 'tsx':
                return 'typescript'

            default:
                if (!runtimeLanguageSet.has(language)) {
                    getLogger().error(`codewhisperer: unknown runtime language ${language}`)
                }
                return language
        }
    }

    /**
     * This is for notebook files map to a new filename with the corresponding language extension
     * @param languageId : vscode language id or codewhisperer language name
     * @returns corresponding language extension if any, otherwise undefined
     */
    public getLanguageExtensionForNotebook(languageId?: string): string | undefined {
        return this.supportedLanguageExtensionMap.get(this.normalizeLanguage(languageId)) ?? undefined
    }

    /**
     * @param languageId : vscode language id or codewhisperer language name
     * @returns An object with a field language: CodewhispererLanguage, if no corresponding CodewhispererLanguage ID, plaintext is returned
     */
    public getLanguageContext(languageId?: string): { language: CodewhispererLanguage } {
        return { language: this.normalizeLanguage(languageId) ?? 'plaintext' }
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
        const runtimeLanguage: codewhispererClient.ProgrammingLanguage = {
            languageName: this.toRuntimeLanguage(
                request.fileContext.programmingLanguage.languageName as CodewhispererLanguage
            ),
        }

        return {
            ...request,
            fileContext: {
                ...fileContext,
                programmingLanguage: runtimeLanguage,
            },
        }
    }

    /**
     *
     * @param languageId: either vscodeLanguageId or CodewhispererLanguage
     * @returns ture if the language is supported by CodeWhisperer otherwise false
     */
    public isLanguageSupported(languageId: string): boolean {
        const lang = this.normalizeLanguage(languageId)
        return lang !== undefined && this.normalizeLanguage(languageId) !== 'plaintext'
    }
}

export const runtimeLanguageContext = new RuntimeLanguageContext()
