/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import vscode from 'vscode'
import { SecurityScanLanguageId } from '../../codewhisperer/models/constants'

interface CommentConfig {
    lineComment?: string
    blockComment?: [string, string]
}

const defaultCommentConfig: CommentConfig = { lineComment: '//', blockComment: ['/*', '*/'] }

const languageCommentConfig: Record<SecurityScanLanguageId, CommentConfig | undefined> = {
    java: defaultCommentConfig,
    python: { lineComment: '#', blockComment: ["'''", "'''"] },
    javascript: defaultCommentConfig,
    javascriptreact: defaultCommentConfig,
    typescript: defaultCommentConfig,
    typescriptreact: defaultCommentConfig,
    csharp: defaultCommentConfig,
    c: defaultCommentConfig,
    cpp: defaultCommentConfig,
    go: defaultCommentConfig,
    php: defaultCommentConfig,
    ruby: { lineComment: '#', blockComment: ['=begin', '=end'] },
    golang: defaultCommentConfig,
    json: undefined,
    yaml: { lineComment: '#' },
    tf: { lineComment: '#', blockComment: defaultCommentConfig.blockComment },
    hcl: { lineComment: '#', blockComment: defaultCommentConfig.blockComment },
    terraform: { lineComment: '#', blockComment: defaultCommentConfig.blockComment },
    terragrunt: { lineComment: '#', blockComment: defaultCommentConfig.blockComment },
    packer: { lineComment: '#', blockComment: defaultCommentConfig.blockComment },
    plaintext: undefined,
    jsonc: { lineComment: '//' },
    xml: { blockComment: ['<!--', '-->'] },
    toml: { lineComment: '#' },
    'pip-requirements': { lineComment: '#' },
    'java-properties': { lineComment: '#' },
    'go.mod': { lineComment: '//' },
    'go.sum': undefined,
    kotlin: defaultCommentConfig,
    scala: defaultCommentConfig,
    sh: { lineComment: '#', blockComment: [": '", "'"] },
    shell: { lineComment: '#', blockComment: [": '", "'"] },
    shellscript: { lineComment: '#', blockComment: [": '", "'"] },
}

export function getLanguageCommentConfig(languageId: string): CommentConfig {
    return languageCommentConfig[languageId as SecurityScanLanguageId] ?? {}
}

export function detectCommentAboveLine(document: vscode.TextDocument, line: number, comment: string): boolean {
    const languageId = document.languageId

    const { lineComment, blockComment } = getLanguageCommentConfig(languageId)

    for (let i = line - 1; i >= 0; i--) {
        const lineText = document.lineAt(i).text.trim()
        if (lineText === '') {
            continue
        }
        if (lineComment && lineComment.length && lineText.startsWith(lineComment) && lineText.includes(comment)) {
            return true
        }
        if (blockComment && blockComment.length === 2) {
            const [blockCommentStart, blockCommentEnd] = blockComment
            if (
                lineText.startsWith(blockCommentStart) &&
                lineText.includes(comment) &&
                lineText.endsWith(blockCommentEnd)
            ) {
                return true
            }
        }
        return false
    }

    return false
}

export function insertCommentAboveLine(document: vscode.TextDocument, line: number, comment: string): void {
    const languageId = document.languageId
    const { lineComment, blockComment } = getLanguageCommentConfig(languageId)
    if (!lineComment && !blockComment) {
        return
    }

    const edit = new vscode.WorkspaceEdit()
    const position = new vscode.Position(line, 0)
    const indent = ' '.repeat(Math.max(0, document.lineAt(line).firstNonWhitespaceCharacterIndex))
    const commentText = lineComment
        ? `${indent}${lineComment} ${comment}\n`
        : blockComment?.[0] && blockComment[1]
          ? `${indent}${blockComment[0]} ${comment} ${blockComment[1]}\n`
          : `${indent}${defaultCommentConfig.lineComment} ${comment}\n`
    edit.insert(document.uri, position, commentText)
    void vscode.workspace.applyEdit(edit)
}
