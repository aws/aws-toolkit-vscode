/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { FeatureConfigProvider, fs } from '../../../shared'
import path = require('path')
import { BM25Document, BM25Okapi } from './rankBm25'
import { ToolkitError } from '../../../shared/errors'
import {
    crossFileContextConfig,
    supplementalContextTimeoutInMs,
    supplemetalContextFetchingTimeoutMsg,
} from '../../models/constants'
import { CancellationError } from '../../../shared/utilities/timeoutUtils'
import { isTestFile } from './codeParsingUtil'
import { getFileDistance } from '../../../shared/filesystemUtilities'
import { getOpenFilesInWindow } from '../../../shared/utilities/editorUtilities'
import { getLogger } from '../../../shared/logger/logger'
import { CodeWhispererSupplementalContext, CodeWhispererSupplementalContextItem } from '../../models/model'
import { LspController } from '../../../amazonq/lsp/lspController'
import { waitUntil } from '../../../shared/utilities/timeoutUtils'

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

/**
 * `none`: supplementalContext is not supported
 * `opentabs`: opentabs_BM25
 * `codemap`: repomap + opentabs BM25
 * `bm25`: global_BM25
 * `default`: repomap + global_BM25
 */
type SupplementalContextConfig = 'none' | 'opentabs' | 'codemap' | 'bm25' | 'default'

export async function fetchSupplementalContextForSrc(
    editor: vscode.TextEditor,
    cancellationToken: vscode.CancellationToken
): Promise<Pick<CodeWhispererSupplementalContext, 'supplementalContextItems' | 'strategy'> | undefined> {
    const supplementalContextConfig = getSupplementalContextConfig(editor.document.languageId)

    // not supported case
    if (supplementalContextConfig === 'none') {
        return undefined
    }

    // opentabs context will use bm25 and users' open tabs to fetch supplemental context
    if (supplementalContextConfig === 'opentabs') {
        return {
            supplementalContextItems: (await fetchOpentabsContext(editor, cancellationToken)) ?? [],
            strategy: 'opentabs',
        }
    }

    // codemap will use opentabs context plus repomap if it's present
    if (supplementalContextConfig === 'codemap') {
        const opentabsContextAndCodemap = await waitUntil(
            async function () {
                const result: CodeWhispererSupplementalContextItem[] = []
                const opentabsContext = await fetchOpentabsContext(editor, cancellationToken)
                const codemap = await fetchProjectContext(editor, 'codemap')

                if (codemap && codemap.length > 0) {
                    result.push(...codemap)
                }

                if (opentabsContext && opentabsContext.length > 0) {
                    result.push(...opentabsContext)
                }

                return result
            },
            { timeout: supplementalContextTimeoutInMs, interval: 5, truthy: false }
        )

        return {
            supplementalContextItems: opentabsContextAndCodemap ?? [],
            strategy: 'codemap',
        }
    }

    // fallback to opentabs if projectContext timeout for 'default' | 'bm25'
    const opentabsContextPromise = waitUntil(
        async function () {
            return await fetchOpentabsContext(editor, cancellationToken)
        },
        { timeout: supplementalContextTimeoutInMs, interval: 5, truthy: false }
    )

    // global bm25 without repomap
    if (supplementalContextConfig === 'bm25') {
        const projectBM25Promise = waitUntil(
            async function () {
                return await fetchProjectContext(editor, 'bm25')
            },
            { timeout: supplementalContextTimeoutInMs, interval: 5, truthy: false }
        )

        const [projectContext, opentabsContext] = await Promise.all([projectBM25Promise, opentabsContextPromise])
        if (projectContext && projectContext.length > 0) {
            return {
                supplementalContextItems: projectContext,
                strategy: 'bm25',
            }
        }

        return {
            supplementalContextItems: opentabsContext ?? [],
            strategy: 'opentabs',
        }
    }

    // global bm25 with repomap
    const projectContextAndCodemapPromise = waitUntil(
        async function () {
            return await fetchProjectContext(editor, 'default')
        },
        { timeout: supplementalContextTimeoutInMs, interval: 5, truthy: false }
    )

    const [projectContext, opentabsContext] = await Promise.all([
        projectContextAndCodemapPromise,
        opentabsContextPromise,
    ])
    if (projectContext && projectContext.length > 0) {
        return {
            supplementalContextItems: projectContext,
            strategy: 'default',
        }
    }

    return {
        supplementalContextItems: opentabsContext ?? [],
        strategy: 'opentabs',
    }
}

export async function fetchProjectContext(
    editor: vscode.TextEditor,
    target: 'default' | 'codemap' | 'bm25'
): Promise<CodeWhispererSupplementalContextItem[]> {
    const inputChunkContent = getInputChunk(editor)

    const inlineProjectContext: { content: string; score: number; filePath: string }[] =
        await LspController.instance.queryInlineProjectContext(
            inputChunkContent.content,
            editor.document.uri.fsPath,
            target
        )

    return inlineProjectContext
}

export async function fetchOpentabsContext(
    editor: vscode.TextEditor,
    cancellationToken: vscode.CancellationToken
): Promise<CodeWhispererSupplementalContextItem[] | undefined> {
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
    const inputChunk: Chunk = getInputChunk(editor)
    const bestChunks: Chunk[] = findBestKChunkMatches(inputChunk, chunkList, crossFileContextConfig.topK)
    throwIfCancelled(cancellationToken)

    // Step 4: Transform best chunks to supplemental contexts
    const supplementalContexts: CodeWhispererSupplementalContextItem[] = []
    let totalLength = 0
    for (const chunk of bestChunks) {
        throwIfCancelled(cancellationToken)

        totalLength += chunk.nextContent.length

        if (totalLength > crossFileContextConfig.maximumTotalLength) {
            break
        }

        supplementalContexts.push({
            filePath: chunk.fileName,
            content: chunk.nextContent,
            score: chunk.score,
        })
    }

    // DO NOT send code chunk with empty content
    getLogger().debug(`CodeWhisperer finished fetching crossfile context out of ${relevantCrossFilePaths.length} files`)
    return supplementalContexts
}

function findBestKChunkMatches(chunkInput: Chunk, chunkReferences: Chunk[], k: number): Chunk[] {
    const chunkContentList = chunkReferences.map((chunk) => chunk.content)

    // performBM25Scoring returns the output in a sorted order (descending of scores)
    const top3: BM25Document[] = new BM25Okapi(chunkContentList).topN(chunkInput.content, crossFileContextConfig.topK)

    return top3.map((doc) => {
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
function getInputChunk(editor: vscode.TextEditor) {
    const chunkSize = crossFileContextConfig.numberOfLinesEachChunk
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
 * @returns specifically returning undefined if the langueage is not supported,
 * otherwise true/false depending on if the language is fully supported or not belonging to the user group
 */
function getSupplementalContextConfig(languageId: vscode.TextDocument['languageId']): SupplementalContextConfig {
    if (!isCrossFileSupported(languageId)) {
        return 'none'
    }

    const group = FeatureConfigProvider.instance.getProjectContextGroup()
    switch (group) {
        case 'control':
            return 'opentabs'

        case 't1':
            return 'codemap'

        case 't2':
            return 'bm25'
    }
}

/**
 * This linking is required from science experimentations to pass the next contnet chunk
 * when a given chunk context passes the match in BM25.
 * Special handling is needed for last(its next points to its own) and first chunk
 */
export function linkChunks(chunks: Chunk[]) {
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

    const fileContent = (await fs.readFileText(filePath)).trimEnd()
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
    const unsortedCandidates = await getOpenFilesInWindow(async (candidateFile) => {
        return (
            targetFile !== candidateFile &&
            (path.extname(targetFile) === path.extname(candidateFile) ||
                (dialects && dialects.has(path.extname(candidateFile)))) &&
            !(await isTestFile(candidateFile, { languageId: language }))
        )
    })

    return unsortedCandidates
        .map((candidate) => {
            return {
                file: candidate,
                fileDistance: getFileDistance(targetFile, candidate),
            }
        })
        .sort((file1, file2) => {
            return file1.fileDistance - file2.fileDistance
        })
        .map((fileToDistance) => {
            return fileToDistance.file
        })
}

function throwIfCancelled(token: vscode.CancellationToken): void | never {
    if (token.isCancellationRequested) {
        throw new ToolkitError(supplemetalContextFetchingTimeoutMsg, { cause: new CancellationError('timeout') })
    }
}
