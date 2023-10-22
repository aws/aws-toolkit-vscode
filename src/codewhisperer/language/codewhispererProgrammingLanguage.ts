/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { CodeWhispererJava } from './codewhispererJava'
import { CodeWhispererPython } from './codewhispererPython'
import { CodeWhispererTypescript, CodeWhispererTsx } from './codewhispererTypescript'
import { CodeWhispererCsharp } from './codewhispererCsharp'
import { CodeWhispererJavascript, CodeWhispererJsx } from './codewhispererJavascript'
import { CodeWhispererC } from './codewhispererC'
import { CodeWhispererCpp } from './codewhispererCpp'
import { CodeWhispererGo } from './codewhispererGo'
import { CodeWhispererKotlin } from './codewhispererKotlin'
import { CodeWhispererPhp } from './codewhispererPhp'
import { CodeWhispererRuby } from './codewhispererRuby'
import { CodeWhispererRust } from './codewhispererRust'
import { CodeWhispererScala } from './codewhispererScala'
import { CodeWhispererShellscript } from './codewhispererShellscript'
import { CodeWhispererSql } from './codewhispererSql'
import { CodewhispererLanguage } from '../../shared/telemetry/telemetry.gen'
import path from 'path'

export function getLanguage(document: vscode.TextDocument): CodeWhispererProgrammingLanguage {
    const languageId = document.languageId
    return (
        platformLanguageMap[languageId as PlatformLanguageId] ??
        extToLanguage.get(path.extname(document.fileName)) ??
        platformLanguageMap.plaintext
    )
}

/**
 * This is for notebook files map to a new filename with the corresponding language extension
 * @param platformLanguageId : official vscode languageId
 * @returns corresponding language extension if any, otherwise undefined
 */
export function getLanguageExtensionForNotebook(platformLanguageId: string): string | undefined {
    const lang = platformLanguageMap[platformLanguageId as PlatformLanguageId] ?? undefined
    if (!lang) {
        return undefined
    }

    const ext: string | undefined = languageToExts[lang.id][0]
    return ext
}

export abstract class CodeWhispererProgrammingLanguage {
    abstract readonly id: CodewhispererLanguage

    abstract toCodeWhispererRuntimeLanguage(): CodeWhispererProgrammingLanguage

    abstract isCodeCompletionSupported(): boolean

    abstract isCodeScanSupported(): boolean

    static from(id: string): CodeWhispererProgrammingLanguage {
        return platformLanguageMap[id as PlatformLanguageId] ?? platformLanguageMap.plaintext
    }
}

class CodeWhispererPlaintext extends CodeWhispererProgrammingLanguage {
    readonly id = 'plaintext'
    toCodeWhispererRuntimeLanguage(): CodeWhispererProgrammingLanguage {
        return this
    }

    isCodeCompletionSupported(): boolean {
        return false
    }

    isCodeScanSupported(): boolean {
        return false
    }
}

type PlatformLanguageId = (typeof platformLanguageIds)[number]

const platformLanguageIds = [
    'java',
    'python',
    'javascript',
    'javascriptreact',
    'typescript',
    'typescriptreact',
    'csharp',
    'c',
    'cpp',
    'c_cpp', // Cloud9 reports C++ files with this language-id.
    'go',
    'kotlin',
    'php',
    'ruby',
    'rust',
    'scala',
    'shellscript',
    'sh', // Cloud9 reports bash files with this language-id
    'sql',
    'plaintext',
] as const

const platformLanguageMap: Record<PlatformLanguageId, CodeWhispererProgrammingLanguage> = {
    java: new CodeWhispererJava(),
    python: new CodeWhispererPython(),
    javascript: new CodeWhispererJavascript(),
    javascriptreact: new CodeWhispererJsx(),
    typescript: new CodeWhispererTypescript(),
    typescriptreact: new CodeWhispererTsx(),
    csharp: new CodeWhispererCsharp(),
    c: new CodeWhispererC(),
    cpp: new CodeWhispererCpp(),
    c_cpp: new CodeWhispererCpp(),
    go: new CodeWhispererGo(),
    kotlin: new CodeWhispererKotlin(),
    php: new CodeWhispererPhp(),
    ruby: new CodeWhispererRuby(),
    rust: new CodeWhispererRust(),
    scala: new CodeWhispererScala(),
    shellscript: new CodeWhispererShellscript(),
    sh: new CodeWhispererShellscript(),
    sql: new CodeWhispererSql(),
    plaintext: new CodeWhispererPlaintext(),
}

const languageToExts: Record<CodewhispererLanguage, string[]> = {
    java: ['java'],
    python: ['py'],
    javascript: ['js'],
    plaintext: ['txt'],
    jsx: ['jsx'],
    typescript: ['ts'],
    tsx: ['tsx'],
    csharp: ['cs'],
    c: ['c'],
    cpp: ['cpp', 'cc', 'c++'],
    go: ['go'],
    kotlin: ['kt'],
    php: ['php'],
    ruby: ['rb'],
    rust: ['rs'],
    scala: ['scala'],
    shell: ['sh'],
    sql: ['sql'],
}

/**
 * {
 *   'cpp': 'cpp',
 *   'cc': 'cpp',
 *   'c++': 'cpp',
 *   'java': 'java'
 * }
 */
const extToLanguage: Map<string, CodewhispererLanguage> = Object.keys(languageToExts).reduce((acc, language) => {
    const extensions = languageToExts[language as CodewhispererLanguage]
    extensions.forEach(ext => {
        acc.set(ext, language as CodewhispererLanguage)
    })
    return acc
}, new Map())
