/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export function extractLanguageAndOtherContext(languageId?: string): { language?: string; otherContext: string[] } {
    if (languageId === undefined) {
        return { otherContext: [] }
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
        return { language: languageId, otherContext: [] }
    }
    switch (languageId) {
        case 'bat':
            return { language: 'bat', otherContext: ['windows'] }
        case 'cpp':
            return { language: 'c++', otherContext: [] }
        case 'csharp':
            return { language: 'c#', otherContext: [] }
        case 'cuda-cpp':
            return { language: 'c++', otherContext: ['cuda'] }
        case 'dockerfile':
            return { language: 'dockerfile', otherContext: ['docker'] }
        case 'fsharp':
            return { language: 'f#', otherContext: [] }
        case 'git-commit':
            return { language: 'git', otherContext: ['commit'] }
        case 'git-rebase':
            return { language: 'git', otherContext: ['rebase'] }
        case 'javascriptreact':
            return { language: 'javascript', otherContext: ['react'] }
        case 'jsonc':
            return { language: 'json', otherContext: ['comments'] }
        case 'objective-c':
            return { language: 'objective-c', otherContext: [] }
        case 'objective-cpp':
            return { language: 'objective-c++', otherContext: [] }
        case 'perl6':
            return { language: 'raku', otherContext: ['perl'] }
        case 'plaintext':
            return { otherContext: [] }
        case 'jade':
            return { language: 'pug', otherContext: [] }
        case 'razor':
            return { language: 'razor', otherContext: ['html'] }
        case 'scss':
            return { language: 'sass', otherContext: ['scss', 'css'] }
        case 'shellscript':
            return { language: 'sh', otherContext: [] }
        case 'typescriptreact':
            return { language: 'typescript', otherContext: ['react'] }
        case 'vb':
            return { language: 'visual-basic', otherContext: [] }
        case 'vue-html':
            return { language: 'vue', otherContext: ['html'] }
        default:
            if (['javascript', 'node'].some(identifier => languageId.includes(identifier))) {
                return { language: 'javascript', otherContext: [] }
            } else if (languageId.includes('typescript')) {
                return { language: 'typescript', otherContext: [] }
            } else if (languageId.includes('python')) {
                return { language: 'python', otherContext: [] }
            }
            return { language: undefined, otherContext: [] }
    }
}
