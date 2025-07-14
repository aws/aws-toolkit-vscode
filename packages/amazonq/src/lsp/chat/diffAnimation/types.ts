/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

export interface PendingFileWrite {
    filePath: string
    originalContent: string
    toolUseId: string
    timestamp: number
    changeLocation?: {
        startLine: number
        endLine: number
        startChar?: number
        endChar?: number
    }
}

export interface QueuedAnimation {
    originalContent: string
    newContent: string
    toolUseId: string
    changeLocation?: {
        startLine: number
        endLine: number
        startChar?: number
        endChar?: number
    }
}

export interface DiffAnimation {
    uri: vscode.Uri
    originalContent: string
    newContent: string
    isShowingStaticDiff?: boolean
    animationCancelled?: boolean
    isFromChatClick?: boolean
}

export interface PartialUpdateOptions {
    changeLocation?: {
        startLine: number
        endLine: number
        startChar?: number
        endChar?: number
    }
    searchContent?: string
    isPartialUpdate?: boolean
}

export interface DiffLine {
    type: 'unchanged' | 'added' | 'removed'
    content: string
    lineNumber: number
    oldLineNumber?: number
    newLineNumber?: number
}

export interface ChangedRegion {
    startLine: number
    endLine: number
    totalLines: number
}

export interface ScanPlan {
    leftLines: Array<DiffLine & { index: number }>
    rightLines: Array<DiffLine & { index: number }>
    scanPlan: Array<{
        leftIndex: number | undefined
        rightIndex: number | undefined
        leftLine?: DiffLine & { index: number }
        rightLine?: DiffLine & { index: number }
        preAdded?: boolean
    }>
}

export interface WebviewMessage {
    command: string
    [key: string]: any
}

export interface AnimationHistory {
    lastAnimatedContent: string
    animationCount: number
    isCurrentlyAnimating: boolean
}
