/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TextDocument } from 'vscode'

export function extractLanguageNameFromFile(file: TextDocument): string | undefined {
    const languageId = file.languageId

    if (languageId === undefined) {
        return undefined
    }
    if (
        [
            'yaml',
            'xsl',
            'xml',
            'vue',
            'tex',
            'typescript',
            'swift',
            'stylus',
            'sql',
            'slim',
            'shaderlab',
            'sass',
            'rust',
            'ruby',
            'r',
            'python',
            'pug',
            'powershell',
            'php',
            'perl',
            'markdown',
            'makefile',
            'lua',
            'less',
            'latex',
            'json',
            'javascript',
            'java',
            'ini',
            'html',
            'haml',
            'handlebars',
            'groovy',
            'go',
            'diff',
            'css',
            'c',
            'coffeescript',
            'clojure',
            'bibtex',
            'abap',
        ].includes(languageId)
    ) {
        return languageId
    }
    switch (languageId) {
        case 'bat':
            return 'bat'
        case 'cpp':
            return 'c++'
        case 'csharp':
            return 'c#'
        case 'cuda-cpp':
            return 'c++'
        case 'dockerfile':
            return 'dockerfile'
        case 'fsharp':
            return 'f#'
        case 'git-commit':
            return 'git'
        case 'git-rebase':
            return 'git'
        case 'javascriptreact':
            return 'javascript'
        case 'jsonc':
            return 'json'
        case 'objective-c':
            return 'objective-c'
        case 'objective-cpp':
            return 'objective-c++'
        case 'perl6':
            return 'raku'
        case 'plaintext':
            return undefined
        case 'jade':
            return 'pug'
        case 'razor':
            return 'razor'
        case 'scss':
            return 'sass'
        case 'shellscript':
            return 'sh'
        case 'typescriptreact':
            return 'typescript'
        case 'vb':
            return 'visual-basic'
        case 'vue-html':
            return 'vue'
        default:
            if (['javascript', 'node'].some(identifier => languageId.includes(identifier))) {
                return 'javascript'
            } else if (languageId.includes('typescript')) {
                return 'typescript'
            } else if (languageId.includes('python')) {
                return 'python'
            }
            return undefined
    }
}

// eslint-disable-next-line id-length
export function extractAdditionalLanguageMatchPoliciesFromFile(file: TextDocument): Set<string> {
    const languageId = file.languageId

    if (languageId === undefined) {
        return new Set<string>()
    }
    if (
        [
            'yaml',
            'xsl',
            'xml',
            'vue',
            'tex',
            'typescript',
            'swift',
            'stylus',
            'sql',
            'slim',
            'shaderlab',
            'sass',
            'rust',
            'ruby',
            'r',
            'python',
            'pug',
            'powershell',
            'php',
            'perl',
            'markdown',
            'makefile',
            'lua',
            'less',
            'latex',
            'json',
            'javascript',
            'java',
            'ini',
            'html',
            'haml',
            'handlebars',
            'groovy',
            'go',
            'diff',
            'css',
            'c',
            'coffeescript',
            'clojure',
            'bibtex',
            'abap',
        ].includes(languageId)
    ) {
        return new Set<string>()
    }
    switch (languageId) {
        case 'bat':
            return new Set<string>(['windows'])
        case 'cpp':
            return new Set<string>()
        case 'csharp':
            return new Set<string>()
        case 'cuda-cpp':
            return new Set<string>(['cuda'])
        case 'dockerfile':
            return new Set<string>(['docker'])
        case 'fsharp':
            return new Set<string>()
        case 'git-commit':
            return new Set<string>(['commit'])
        case 'git-rebase':
            return new Set<string>(['rebase'])
        case 'javascriptreact':
            return new Set<string>(['react'])
        case 'jsonc':
            return new Set<string>(['comments'])
        case 'objective-c':
            return new Set<string>()
        case 'objective-cpp':
            return new Set<string>()
        case 'perl6':
            return new Set<string>(['perl'])
        case 'plaintext':
            return new Set<string>()
        case 'jade':
            return new Set<string>()
        case 'razor':
            return new Set<string>(['html'])
        case 'scss':
            return new Set<string>(['scss', 'css'])
        case 'shellscript':
            return new Set<string>()
        case 'typescriptreact':
            return new Set<string>(['react'])
        case 'vb':
            return new Set<string>()
        case 'vue-html':
            return new Set<string>(['html'])
        default:
            if (['javascript', 'node'].some(identifier => languageId.includes(identifier))) {
                return new Set<string>()
            } else if (languageId.includes('typescript')) {
                return new Set<string>()
            } else if (languageId.includes('python')) {
                return new Set<string>()
            }
            return new Set<string>()
    }
}
