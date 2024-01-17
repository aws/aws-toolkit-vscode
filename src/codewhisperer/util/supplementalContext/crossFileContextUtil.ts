/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import path = require('path')
import { BM25Document, BM25Okapi } from './rankBm25'
import { ToolkitError } from '../../../shared/errors'
import { UserGroup, crossFileContextConfig, supplemetalContextFetchingTimeoutMsg } from '../../models/constants'
import { CancellationError } from '../../../shared/utilities/timeoutUtils'
import { CodeWhispererUserGroupSettings } from '../userGroupUtil'
import { isTestFile } from './codeParsingUtil'
import { getFileDistance } from '../../../shared/filesystemUtilities'
import { getOpenFilesInWindow } from '../../../shared/utilities/editorUtilities'
import { getLogger } from '../../../shared/logger/logger'
import { CodeWhispererSupplementalContext, CodeWhispererSupplementalContextItem } from '../../models/model'
import { fsCommon } from '../../../srcShared/fs'

type CrossFileSupportedLanguage =
    | 'java'
    | 'python'
    | 'javascript'
    | 'typescript'
    | 'javascriptreact'
    | 'typescriptreact'

// TODO: ugly, can we make it prettier? like we have to manually type 'java', 'javascriptreact' which is error prone
// TODO: Move to another config file or constants file
// Supported language to its corresponding file ext
const supportedLanguageToDialects: Readonly<Record<CrossFileSupportedLanguage, Set<string>>> = {
    java: new Set<string>(['.java']),
    python: new Set<string>(['.py']),
    javascript: new Set<string>(['.js', '.jsx']),
    javascriptreact: new Set<string>(['.js', '.jsx']),
    typescript: new Set<string>(['.ts', '.tsx']),
    typescriptreact: new Set<string>(['.ts', '.tsx']),
}

function isCrossFileSupported(languageId: string): languageId is CrossFileSupportedLanguage {
    return Object.keys(supportedLanguageToDialects).includes(languageId)
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
): Promise<Pick<CodeWhispererSupplementalContext, 'supplementalContextItems' | 'strategy'> | undefined> {
    const shouldProceed = shouldFetchCrossFileContext(
        editor.document.languageId,
        CodeWhispererUserGroupSettings.instance.userGroup
    )

    if (!shouldProceed) {
        return shouldProceed === undefined
            ? undefined
            : {
                  supplementalContextItems: [],
                  strategy: 'Empty',
              }
    }

    const codeChunksCalculated = crossFileContextConfig.numberOfChunkToFetch

    // Step 1: Get relevant cross files to refer
    const relevantCrossFilePaths = await getCrossFileCandidates(editor)
    throwIfCancelled(cancellationToken)

    // Step 2: Split files to chunks with upper bound on chunkCount
    // We restrict the total number of chunks to improve on latency.
    // Chunk linking is required as we want to pass the next chunk value for matched chunk.
    let chunkList: Chunk[] = []
    for (const relevantFile of relevantCrossFilePaths) {
        throwIfCancelled(cancellationToken)
        const chunks: Chunk[] = await splitFileToChunks(relevantFile, crossFileContextConfig.numberOfLinesEachChunk)
        const linkedChunks = linkChunks(chunks)
        chunkList.push(...linkedChunks)
        if (chunkList.length >= codeChunksCalculated) {
            break
        }
    }

    // it's required since chunkList.push(...) is likely giving us a list of size > 60
    chunkList = chunkList.slice(0, codeChunksCalculated)

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
    getLogger().debug(`CodeWhisperer finished fetching crossfile context out of ${relevantCrossFilePaths.length} files`)
    return {
        supplementalContextItems: supplementalContexts.filter(item => item.content.trim().length !== 0),
        strategy: 'OpenTabs_BM25',
    }
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
function shouldFetchCrossFileContext(
    languageId: vscode.TextDocument['languageId'],
    userGroup: UserGroup
): boolean | undefined {
    if (!isCrossFileSupported(languageId)) {
        return undefined
    }

    return true
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

export async function splitFileToChunks(filePath: string, chunkSize: number): Promise<Chunk[]> {
    const chunks: Chunk[] = []

    const fileContent = (await fsCommon.readFileAsString(filePath)).trimEnd()
    const lines = fileContent.split('\n')

    for (let i = 0; i < lines.length; i += chunkSize) {
        const chunkContent = lines.slice(i, Math.min(i + chunkSize, lines.length)).join('\n')
        const chunk = { fileName: filePath, content: chunkContent.trimEnd(), nextContent: '' }
        chunks.push(chunk)
    }
    return chunks
}

/**
 * This function will return relevant cross files sorted by file distance for the given editor file
 * by referencing open files, imported files and same package files.
 */
export async function getCrossFileCandidates(editor: vscode.TextEditor): Promise<string[]> {
    const targetFile = editor.document.uri.fsPath
    const language = editor.document.languageId as CrossFileSupportedLanguage
    const dialects = supportedLanguageToDialects[language]

    /**
     * Consider a file which
     * 1. is different from the target
     * 2. has the same file extension or it's one of the dialect of target file (e.g .js vs. .jsx)
     * 3. is not a test file
     */
    const unsortedCandidates = await getOpenFilesInWindow(async candidateFile => {
        return (
            targetFile !== candidateFile &&
            (path.extname(targetFile) === path.extname(candidateFile) ||
                (dialects && dialects.has(path.extname(candidateFile)))) &&
            !(await isTestFile(candidateFile, { languageId: language }))
        )
    })

    return unsortedCandidates
        .map(candidate => {
            return {
                file: candidate,
                fileDistance: getFileDistance(targetFile, candidate),
            }
        })
        .sort((file1, file2) => {
            return file1.fileDistance - file2.fileDistance
        })
        .map(fileToDistance => {
            return fileToDistance.file
        })
}

function throwIfCancelled(token: vscode.CancellationToken): void | never {
    if (token.isCancellationRequested) {
        throw new ToolkitError(supplemetalContextFetchingTimeoutMsg, { cause: new CancellationError('timeout') })
    }
}
