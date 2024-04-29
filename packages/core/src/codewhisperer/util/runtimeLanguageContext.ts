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
    'json',
    'yaml',
    'tf',
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
            golang: 'go',
            hcl: 'tf',
            java: 'java',
            javascript: 'javascript',
            javascriptreact: 'jsx',
            json: 'json',
            jsonc: 'json',
            jsx: 'jsx',
            kotlin: 'kotlin',
            packer: 'tf',
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
            terraform: 'tf',
            terragrunt: 'tf',
            tf: 'tf',
            tsx: 'tsx',
            typescript: 'typescript',
            typescriptreact: 'tsx',
            yml: 'yaml',
            yaml: 'yaml',
        })
        this.supportedLanguageExtensionMap = createConstantMap<CodewhispererLanguage, string>({
            c: 'c',
            cpp: 'cpp',
            csharp: 'cs',
            go: 'go',
            hcl: 'tf',
            java: 'java',
            javascript: 'js',
            json: 'json',
            jsonc: 'json',
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
            tf: 'tf',
            tsx: 'tsx',
            typescript: 'ts',
            yaml: 'yaml',
            yml: 'yaml',
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
     * @param languageId : vscode language id or codewhisperer language name, fileExtension: extension of the selected file
     * @returns An object with a field language: CodewhispererLanguage, if no corresponding CodewhispererLanguage ID, plaintext is returned
     */
    public getLanguageContext(languageId?: string, fileExtension?: string): { language: CodewhispererLanguage } {
        const extensionToLanguageMap: Record<string, CodewhispererLanguage> = {
            tf: 'tf',
            hcl: 'tf',
            json: 'json',
            yaml: 'yaml',
            yml: 'yaml',
            // Add more mappings if needed
        }

        if (languageId === 'plaintext' && fileExtension !== undefined) {
            const languages = extensionToLanguageMap[fileExtension]
            if (languages) {
                return { language: languages }
            }
        }
        return { language: this.normalizeLanguage(languageId) ?? 'plaintext' }
    }

    /**
     *
     * @param fileExtension File extension i.e. py, js, java
     * @returns The corresponding {@link CodewhispererLanguage} of the file extension
     */
    public getLanguageFromFileExtension(fileExtension: string): CodewhispererLanguage | undefined {
        return [...this.supportedLanguageExtensionMap.entries()].find(
            ([, extension]) => extension === fileExtension
        )?.[0]
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
                runtimeLanguageContext.getLanguageContext(
                    request.fileContext.programmingLanguage.languageName,
                    request.fileContext.filename.substring(request.fileContext.filename.lastIndexOf('.') + 1)
                ).language
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
     * @returns true if the language is supported by CodeWhisperer otherwise false
     */
    public isLanguageSupported(languageId: string): boolean {
        const lang = this.normalizeLanguage(languageId)
        return lang !== undefined && this.normalizeLanguage(languageId) !== 'plaintext'
    }
    /**
     *
     * @param fileFormat : vscode editor filecontext filename extension
     * @returns  true if the fileformat is supported by CodeWhisperer otherwise false
     */
    public isFileFormatSupported(fileFormat: string): boolean {
        const fileformat = this.supportedLanguageExtensionMap.get(fileFormat)
        return fileformat !== undefined && this.supportedLanguageExtensionMap.get(fileformat) !== 'txt'
    }
}

export const runtimeLanguageContext = new RuntimeLanguageContext()
