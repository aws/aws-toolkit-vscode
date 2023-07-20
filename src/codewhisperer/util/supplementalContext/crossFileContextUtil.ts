/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as fs from 'fs-extra'
import path = require('path')
import { BM25Document, BM25Okapi } from './rankBm25'
import { ToolkitError } from '../../../shared/errors'
import { UserGroup, crossFileContextConfig, supplemetalContextFetchingTimeoutMsg } from '../../models/constants'
import { CancellationError } from '../../../shared/utilities/timeoutUtils'
import { CodeWhispererSupplementalContextItem } from './supplementalContextUtil'
import { CodeWhispererUserGroupSettings } from '../userGroupUtil'
import { isTestFile } from './codeParsingUtil'
import * as CodeWhispererConstants from '../../models/constants'
import { getOpenFilesInWindow } from '../../../shared/utilities/editorUtilities'

// TODO: ugly, can we make it prettier?
// TODO: Move to another config file or constants file
// Supported language to its dialects
const supportedLanguageToDialects: Record<string, Set<string>> = {
    // TODO: why I couldn't use CodeWhispererConstants.java as key?
    java: new Set<string>([CodeWhispererConstants.java]),
    python: new Set<string>([CodeWhispererConstants.python]),
    javascript: new Set<string>([CodeWhispererConstants.javascript, CodeWhispererConstants.jsx]),
    typescript: new Set<string>([CodeWhispererConstants.typescript, CodeWhispererConstants.tsx]),
}

interface Chunk {
    fileName: string
    content: string
    nextContent: string
    score?: number
}

export async function fetchSupplementalContextForSrc(
    editor: vscode.TextEditor,
    cancellationToken: vscode.CancellationToken
): Promise<CodeWhispererSupplementalContextItem[] | undefined> {
    const shouldProceed = shouldFetchCrossFileContext(
        editor.document.languageId,
        CodeWhispererUserGroupSettings.instance.userGroup
    )

    if (!shouldProceed) {
        return shouldProceed === undefined ? undefined : []
    }

    // Step 1: Get relevant cross files to refer
    const relevantCrossFilePaths = await getCrossFileCandidates(editor)
    throwIfCancelled(cancellationToken)

    // Step 2: Split files to chunks with upper bound on chunkCount
    // We restrict the total number of chunks to improve on latency.
    // Chunk linking is required as we want to pass the next chunk value for matched chunk.
    let chunkList: Chunk[] = []
    for (const relevantFile of relevantCrossFilePaths) {
        throwIfCancelled(cancellationToken)
        const chunks: Chunk[] = splitFileToChunks(relevantFile, crossFileContextConfig.numberOfLinesEachChunk)
        const linkedChunks = linkChunks(chunks)
        chunkList.push(...linkedChunks)
        if (chunkList.length >= crossFileContextConfig.numberOfChunkToFetch) {
            break
        }
    }

    // it's required since chunkList.push(...) is likely giving us a list of size > 60
    chunkList = chunkList.slice(0, crossFileContextConfig.numberOfChunkToFetch)

    // Step 3: Generate Input chunk (10 lines left of cursor position)
    // and Find Best K chunks w.r.t input chunk using BM25
    const inputChunk: Chunk = getInputChunk(editor, crossFileContextConfig.numberOfLinesEachChunk)
    const bestChunks: Chunk[] = findBestKChunkMatches(inputChunk, chunkList, crossFileContextConfig.topK)
    throwIfCancelled(cancellationToken)

    // Step 4: Transform best chunks to supplemental contexts
    const supplementalContexts: CodeWhispererSupplementalContextItem[] = []
    for (const chunk of bestChunks) {
        throwIfCancelled(cancellationToken)

        supplementalContexts.push({
            filePath: chunk.fileName,
            content: chunk.nextContent,
            score: chunk.score,
        })
    }

    // DO NOT send code chunk with empty content
    return supplementalContexts.filter(item => item.content.trim().length !== 0)
}

function findBestKChunkMatches(chunkInput: Chunk, chunkReferences: Chunk[], k: number): Chunk[] {
    const chunkContentList = chunkReferences.map(chunk => chunk.content)

    //performBM25Scoring returns the output in a sorted order (descending of scores)
    const top3: BM25Document[] = new BM25Okapi(chunkContentList).topN(chunkInput.content, crossFileContextConfig.topK)

    return top3.map(doc => {
        // reference to the original metadata since BM25.top3 will sort the result
        const chunkIndex = doc.index
        const chunkReference = chunkReferences[chunkIndex]
        return {
            content: chunkReference.content,
            fileName: chunkReference.fileName,
            nextContent: chunkReference.nextContent,
            score: doc.score,
        }
    })
}

/* This extract 10 lines to the left of the cursor from trigger file.
 * This will be the inputquery to bm25 matching against list of cross-file chunks
 */
function getInputChunk(editor: vscode.TextEditor, chunkSize: number) {
    const cursorPosition = editor.selection.active
    const startLine = Math.max(cursorPosition.line - chunkSize, 0)
    const endLine = Math.max(cursorPosition.line - 1, 0)
    const inputChunkContent = editor.document.getText(
        new vscode.Range(startLine, 0, endLine, editor.document.lineAt(endLine).text.length)
    )
    const inputChunk: Chunk = { fileName: editor.document.fileName, content: inputChunkContent, nextContent: '' }
    return inputChunk
}

/**
 * Util to decide if we need to fetch crossfile context since CodeWhisperer CrossFile Context feature is gated by userGroup and language level
 * @param languageId: VSCode language Identifier
 * @param userGroup: CodeWhisperer user group settings, refer to userGroupUtil.ts
 * @returns specifically returning undefined if the langueage is not supported,
 * otherwise true/false depending on if the language is fully supported or not belonging to the user group
 */
function shouldFetchCrossFileContext(languageId: string, userGroup: UserGroup): boolean | undefined {
    if (!supportedLanguageToDialects[languageId]) {
        return undefined
    }

    if (languageId === 'java') {
        return true
    } else if (supportedLanguageToDialects[languageId] && userGroup === UserGroup.CrossFile) {
        return true
    } else {
        return false
    }
}

/**
 * This linking is required from science experimentations to pass the next contnet chunk
 * when a given chunk context passes the match in BM25.
 * Special handling is needed for last(its next points to its own) and first chunk
 */
function linkChunks(chunks: Chunk[]) {
    const updatedChunks: Chunk[] = []

    // This additional chunk is needed to create a next pointer to chunk 0.
    const firstChunk = chunks[0]
    const firstChunkSubContent = firstChunk.content.split('\n').slice(0, 3).join('\n').trimEnd()
    const newFirstChunk = {
        fileName: firstChunk.fileName,
        content: firstChunkSubContent,
        nextContent: firstChunk.content,
    }
    updatedChunks.push(newFirstChunk)

    const n = chunks.length
    for (let i = 0; i < n; i++) {
        const chunk = chunks[i]
        const nextChunk = i < n - 1 ? chunks[i + 1] : chunk

        chunk.nextContent = nextChunk.content
        updatedChunks.push(chunk)
    }

    return updatedChunks
}

function splitFileToChunks(filePath: string, chunkSize: number): Chunk[] {
    const chunks: Chunk[] = []

    const fileContent = fs.readFileSync(filePath, 'utf-8').trimEnd()
    const lines = fileContent.split('\n')

    for (let i = 0; i < lines.length; i += chunkSize) {
        const chunkContent = lines.slice(i, Math.min(i + chunkSize, lines.length)).join('\n')
        const chunk = { fileName: filePath, content: chunkContent.trimEnd(), nextContent: '' }
        chunks.push(chunk)
    }
    return chunks
}

/**
 * This function will return relevant cross files for the given editor file
 * by referencing open files, imported files and same package files.
 */
async function getCrossFileCandidates(editor: vscode.TextEditor): Promise<string[]> {
    const targetFile = editor.document.uri.fsPath
    const language = editor.document.languageId
    const dialects = supportedLanguageToDialects[language]

    /**
     * Consider a file which
     * 1. is different from the target
     * 2. has the same file extension or it's one of the dialect of target file (e.g .js vs. .jsx)
     * 3. is not a test file
     */
    return await getOpenFilesInWindow(async candidateFile => {
        return (
            targetFile !== candidateFile &&
            (path.extname(targetFile) === path.extname(candidateFile) ||
                (dialects && dialects.has(path.extname(candidateFile)))) &&
            !(await isTestFile(candidateFile, { languageId: language }))
        )
    })
}

function throwIfCancelled(token: vscode.CancellationToken): void | never {
    if (token.isCancellationRequested) {
        throw new ToolkitError(supplemetalContextFetchingTimeoutMsg, { cause: new CancellationError('timeout') })
    }
}
