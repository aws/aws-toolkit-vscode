/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

export interface DiffAnimation {
    uri: vscode.Uri
    originalContent: string
    newContent: string
    isShowingStaticDiff?: boolean
    animationCancelled?: boolean
    isFromChatClick?: boolean
}

export interface FsWriteParams {
    command?: string
    insertLine?: number
    oldStr?: string
    newStr?: string
    fileText?: string
    explanation?: string
    pairIndex?: number
    totalPairs?: number
}
