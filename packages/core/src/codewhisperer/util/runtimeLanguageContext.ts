/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../../shared/logger/logger'
import { CodewhispererLanguage } from '../../shared/telemetry/telemetry.gen'
import { createConstantMap, ConstantMap } from '../../shared/utilities/tsUtils'
import * as codewhispererClient from '../client/codewhisperer'
import * as CodeWhispererConstants from '../models/constants'
import {
    CLanguage,
    CSharpLanguage,
    CppLanguage,
    GoLanguage,
    JavaLanguage,
    JavascriptLanguage,
    JsonLanguage,
    JsxLanguage,
    KotlinLanguage,
    Language,
    PhpLanguage,
    PlaintextLanguage,
    PythonLanguage,
    RubyLanguage,
    RustLanguage,
    ScalaLanguage,
    ShellLanguage,
    SqlLanguage,
    TerraformLanguage,
    TsxLanguage,
    TypescriptLanguage,
    YamlLanguage,
} from './language/LanguageBase'
import { PlatformLanguageId } from '../models/constants'

function createMap<T extends PropertyKey, U>(obj: {
    readonly [P in T]: U
}) {
    return new Map<T, U>(Object.entries(obj) as [T, U][])
}

// PlatformLanguageIdentifier (VSC/C9) to Language Pojos
const PlanformLanguageIdentifierMapping = createMap<PlatformLanguageId, Language>({
    c: CLanguage,
    c_cpp: CppLanguage,
    cpp: CppLanguage,
    csharp: CSharpLanguage,
    go: GoLanguage,
    golang: GoLanguage,
    hcl: TerraformLanguage, // TODO
    java: JavaLanguage,
    javascript: JavascriptLanguage,
    javascriptreact: JsxLanguage,
    json: JsonLanguage,
    jsonc: JsonLanguage,
    kotlin: KotlinLanguage,
    packer: PlaintextLanguage, // TODO
    php: PhpLanguage,
    plaintext: PlaintextLanguage,
    python: PythonLanguage,
    ruby: RubyLanguage,
    rust: RustLanguage,
    scala: ScalaLanguage,
    sh: ShellLanguage,
    shellscript: ShellLanguage,
    sql: SqlLanguage,
    terraform: TerraformLanguage, // TODO
    terragrunt: TerraformLanguage, // TODO
    tf: TerraformLanguage, // TODO
    typescript: TypescriptLanguage,
    typescriptreact: TsxLanguage,
    yaml: YamlLanguage,
})

type FileExtension =
    | 'c'
    | 'cc'
    | 'cpp'
    | 'cs'
    | 'go'
    | 'h'
    | 'hcl'
    | 'java'
    | 'js'
    | 'json'
    | 'jsonc'
    | 'jsx'
    | 'kt'
    | 'txt'
    | 'php'
    | 'py'
    | 'rb'
    | 'rs'
    | 'scala'
    | 'sh'
    | 'sql'
    | 'tf'
    | 'tsx'
    | 'ts'
    | 'yaml'
    | 'yml'

const extensions: { language: Language; exts: FileExtension[] }[] = [
    { language: CLanguage, exts: ['c', 'h'] },
    { language: CppLanguage, exts: ['cpp', 'cc'] },
    { language: CSharpLanguage, exts: ['cs'] },
    { language: GoLanguage, exts: ['go'] },
    { language: JavaLanguage, exts: ['java'] },
    { language: JavascriptLanguage, exts: ['js'] },
    { language: JsxLanguage, exts: ['jsx'] },
    { language: JsonLanguage, exts: ['json', 'jsonc'] },
    { language: KotlinLanguage, exts: ['kt'] },
    { language: PlaintextLanguage, exts: ['txt'] },
    { language: PhpLanguage, exts: ['php'] },
    { language: PythonLanguage, exts: ['py'] },
    { language: RubyLanguage, exts: ['rb'] },
    { language: RustLanguage, exts: ['rs'] },
    { language: ScalaLanguage, exts: ['scala'] },
    { language: ShellLanguage, exts: ['sh'] },
    { language: SqlLanguage, exts: ['sql'] },
    { language: TerraformLanguage, exts: ['tf', 'hcl'] },
    { language: TypescriptLanguage, exts: ['ts'] },
    { language: TsxLanguage, exts: ['tsx'] },
]

const extsMapping = extensions
    .map((obj) => {
        const exts = obj.exts
        const lang = obj.language
        return exts.map((ext) => [ext, lang] as [string, Language])
    })
    .flat()
    .reduce((map, [ext, lang]) => map.set(ext, lang), new Map<string, Language>())

export class RuntimeLanguageContext {
    constructor() {}

    /**
     * To add a new platform language id:
     * 1. add new platform language ID constant in the file codewhisperer/constant.ts
     * 2. add corresponding CodeWhispererLanguage mapping in the constructor of RuntimeLanguageContext
     * @param languageId : vscode language id or codewhisperer language name
     * @returns normalized language id of type CodewhispererLanguage if any, otherwise undefined
     */
    public normalizeLanguage(languageId: string): Language {
        // TODO: fallback value?
        return PlanformLanguageIdentifierMapping.get(languageId as PlatformLanguageId) ?? PlaintextLanguage
    }

    /**
     * This is for notebook files map to a new filename with the corresponding language extension
     * @param languageId : vscode language id or codewhisperer language name
     * @returns corresponding language extension if any, otherwise undefined
     */
    public getLanguageExtensionForNotebook(languageId: string): string | undefined {
        return [...this.supportedLanguageExtensionMap.entries()].find(
            ([, language]) => language === this.normalizeLanguage(languageId)?.telemetryId
        )?.[0]
    }

    /**
     *
     * @param languageId: vscodeLanguageId
     * @returns true if the language is supported by CodeWhisperer otherwise false
     */
    public isInlineCompletionSupport(languageId: string): boolean {
        const lang = this.normalizeLanguage(languageId)
        return lang.isInlineSupported()
    }

    /**
     *
     * @param fileFormat : vscode editor filecontext filename extension
     * @returns  true if the fileformat is supported by CodeWhisperer otherwise false
     */
    public isFileFormatSupported(fileFormat: string): boolean {
        const language = extsMapping.get(fileFormat)
        return language !== undefined && language !== PlaintextLanguage
    }

    /**
     * @param fileExtension: extension of the selected file
     * @returns corresponding vscode language id if any, otherwise undefined
     */
    public getLanguageFromFileExtension(fileExtension: string): Language | undefined {
        return extsMapping.get(fileExtension)
    }
}

export const runtimeLanguageContext = new RuntimeLanguageContext()
