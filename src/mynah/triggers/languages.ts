/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export function extractLanguageAndOtherContext(languageId?: string): { language?: string; otherContext: Set<string> } {
    if (languageId === undefined) {
        return { otherContext: new Set<string>() }
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
        return { language: languageId, otherContext: new Set<string>() }
    }
    switch (languageId) {
        case 'bat':
            return { language: 'bat', otherContext: new Set<string>(['windows']) }
        case 'cpp':
            return { language: 'c++', otherContext: new Set<string>() }
        case 'csharp':
            return { language: 'c#', otherContext: new Set<string>() }
        case 'cuda-cpp':
            return { language: 'c++', otherContext: new Set<string>(['cuda']) }
        case 'dockerfile':
            return { language: 'dockerfile', otherContext: new Set<string>(['docker']) }
        case 'fsharp':
            return { language: 'f#', otherContext: new Set<string>() }
        case 'git-commit':
            return { language: 'git', otherContext: new Set<string>(['commit']) }
        case 'git-rebase':
            return { language: 'git', otherContext: new Set<string>(['rebase']) }
        case 'javascriptreact':
            return { language: 'javascript', otherContext: new Set<string>(['react']) }
        case 'jsonc':
            return { language: 'json', otherContext: new Set<string>(['comments']) }
        case 'objective-c':
            return { language: 'objective-c', otherContext: new Set<string>() }
        case 'objective-cpp':
            return { language: 'objective-c++', otherContext: new Set<string>() }
        case 'perl6':
            return { language: 'raku', otherContext: new Set<string>(['perl']) }
        case 'plaintext':
            return { otherContext: new Set<string>() }
        case 'jade':
            return { language: 'pug', otherContext: new Set<string>() }
        case 'razor':
            return { language: 'razor', otherContext: new Set<string>(['html']) }
        case 'scss':
            return { language: 'sass', otherContext: new Set<string>(['scss', 'css']) }
        case 'shellscript':
            return { language: 'sh', otherContext: new Set<string>() }
        case 'typescriptreact':
            return { language: 'typescript', otherContext: new Set<string>(['react']) }
        case 'vb':
            return { language: 'visual-basic', otherContext: new Set<string>() }
        case 'vue-html':
            return { language: 'vue', otherContext: new Set<string>(['html']) }
        default:
            if (['javascript', 'node'].some(identifier => languageId.includes(identifier))) {
                return { language: 'javascript', otherContext: new Set<string>() }
            } else if (languageId.includes('typescript')) {
                return { language: 'typescript', otherContext: new Set<string>() }
            } else if (languageId.includes('python')) {
                return { language: 'python', otherContext: new Set<string>() }
            }
            return { language: undefined, otherContext: new Set<string>() }
    }
}
