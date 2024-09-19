/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger } from '../../shared/logger/logger'
import { CodewhispererLanguage } from '../../shared/telemetry/telemetry.gen'
import { createConstantMap, ConstantMap } from '../../shared/utilities/tsUtils'
import * as codewhispererClient from '../client/codewhisperer'
import * as CodeWhispererConstants from '../models/constants'

type Feature = 'inlineCompletion' | 'crossfile' | 'utg'

const featureToLanguagesMap: Record<Feature, Set<CodewhispererLanguage>> = {
    inlineCompletion: new Set([
        'c',
        'cpp',
        'csharp',
        'go',
        'hcl',
        'java',
        'javascript',
        'json',
        'jsonc',
        'jsx',
        'kotlin',
        'php',
        'python',
        'ruby',
        'rust',
        'scala',
        'shell',
        'sql',
        'tf',
        'tsx',
        'typescript',
        'yaml',
    ]),
    crossfile: new Set(['java', 'python', 'javascript', 'jsx', 'typescript', 'tsx']),
    utg: new Set(['java', 'python']),
}

const extensions: { language: CodewhispererLanguage; exts: string[] }[] = [
    { language: 'c', exts: ['c', 'h'] },
    { language: 'cpp', exts: ['cpp', 'cc'] },
    { language: 'csharp', exts: ['cs'] },
    { language: 'go', exts: ['go'] },
    { language: 'java', exts: ['java'] },
    { language: 'javascript', exts: ['js'] },
    { language: 'jsx', exts: ['jsx'] },
    { language: 'json', exts: ['json', 'jsonc'] },
    { language: 'kotlin', exts: ['kt'] },
    { language: 'plaintext', exts: ['txt'] },
    { language: 'php', exts: ['php'] },
    { language: 'python', exts: ['py'] },
    { language: 'ruby', exts: ['rb'] },
    { language: 'rust', exts: ['rs'] },
    { language: 'scala', exts: ['scala'] },
    { language: 'shell', exts: ['sh'] },
    { language: 'sql', exts: ['sql'] },
    { language: 'tf', exts: ['tf', 'hcl'] },
    { language: 'typescript', exts: ['ts'] },
    { language: 'tsx', exts: ['tsx'] },
]

/**  extension to languageId
 * {
 *   'c': 'c',
 *   'h': 'c',
 *   'cpp': 'cpp',
 *   'cs': 'csharp'
 *   ....
 *   'ts': 'typescript'
 * }
 */
const extsMapping = extensions
    .map((obj) => {
        const exts = obj.exts
        const lang = obj.language
        return exts.map((ext) => [ext, lang] as [string, CodewhispererLanguage])
    })
    .flat()
    .reduce((map, [ext, lang]) => map.set(ext, lang), new Map<string, CodewhispererLanguage>())

const runtimeLanguageSet: ReadonlySet<Exclude<CodewhispererLanguage, 'jsx' | 'tsx'>> = new Set([
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
    private languageIdMapping: ConstantMap<
        CodeWhispererConstants.PlatformLanguageId | CodewhispererLanguage,
        CodewhispererLanguage
    >

    constructor() {
        this.languageIdMapping = createConstantMap<
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
            dart: 'dart',
            lua: 'lua',
            powershell: 'powershell',
            r: 'r',
            swift: 'swift',
            systemVerilog: 'systemVerilog',
            vue: 'vue',
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
        return this.languageIdMapping.get(languageId)
    }

    /**
     * Normalize client side language id to service aware language id (service is not aware of jsx/tsx)
     * Only used when invoking CodeWhisperer service API, for client usage please use normalizeLanguage
     * Client side CodewhispererLanguage is a superset of NormalizedLanguageId
     */
    public toRuntimeLanguage(language: CodewhispererLanguage): Exclude<CodewhispererLanguage, 'jsx' | 'tsx'> {
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
        return [...extsMapping.entries()].find(([, language]) => language === this.normalizeLanguage(languageId))?.[0]
    }

    /**
     * @param languageId : vscode language id or codewhisperer language name, fileExtension: extension of the selected file
     * @returns An object with a field language: CodewhispererLanguage, if no corresponding CodewhispererLanguage ID, plaintext is returned
     */
    public getLanguageContext(languageId?: string, fileExtension?: string): { language: CodewhispererLanguage } {
        if (languageId === 'plaintext' && fileExtension !== undefined) {
            const languages = extsMapping.get(fileExtension)
            if (languages) {
                return { language: languages }
            }
        }
        return { language: this.normalizeLanguage(languageId) ?? 'plaintext' }
    }

    /**
     * Mapping the field ProgrammingLanguage of codewhisperer generateRecommendationRequest | listRecommendationRequest to
     * its Codewhisperer runtime language e.g. jsx -> typescript, typescript -> typescript
     * @param request : cwspr generateRecommendationRequest | ListRecommendationRequest
     * @returns request with source language name mapped to cwspr runtime language
     */
    public mapToRuntimeLanguage<
        T extends codewhispererClient.ListRecommendationsRequest | codewhispererClient.GenerateRecommendationsRequest,
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
    public isInlineCompletionSupported(languageId: string): boolean {
        const lang = this.normalizeLanguage(languageId)
        return lang !== undefined && featureToLanguagesMap['inlineCompletion'].has(lang)
    }

    /**
     *
     * @param fileFormat : vscode editor filecontext filename extension
     * @returns  true if the fileformat is supported by CodeWhisperer otherwise false
     */
    public isFileFormatSupported(fileFormat: string): boolean {
        const language = extsMapping.get(fileFormat)
        return language !== undefined && language !== 'plaintext'
    }

    /**
     * @param fileExtension: extension of the selected file
     * @returns corresponding vscode language id if any, otherwise undefined
     */
    public getLanguageFromFileExtension(fileExtension: string) {
        return extsMapping.get(fileExtension)
    }
}

export const runtimeLanguageContext = new RuntimeLanguageContext()
