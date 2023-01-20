/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { NotificationType } from '@aws/mynah-ui'
import { Range } from 'vscode-languageserver-protocol'

export abstract class SearchInput {
    public abstract searchText(
        newInput: string,
        queryContext: QueryContext,
        code?: string,
        queryId?: string,
        codeQuery?: CodeQuery,
        codeSelection?: CodeSelection,
        headerInfo?: HeaderInfo
    ): Promise<void>
}

export interface SearchOutput {
    readonly query: Query
    readonly suggestions: Promise<SearchSuggestion[]>
}

export interface SearchSuggestion {
    readonly score: number
    readonly url: string
    readonly title: string
    readonly body: string
    readonly preview?: CodePreview
    readonly context?: string[]
    readonly type?: string
}

export interface CodePreview {
    readonly rawFileUrl: string
    readonly fullRange: Range
}

export interface QueryContext {
    must: string[]
    should: string[]
    mustNot: string[]
}

export interface CodeQuery {
    simpleNames: string[]
    usedFullyQualifiedNames: string[]
}

export interface CodeSelection {
    selectedCode: string
    file?: {
        range: {
            start: { row: string; column: string }
            end: { row: string; column: string }
        }
        name: string
    }
}

export interface HeaderInfo {
    content: string
    type?: NotificationType
}

export interface Query {
    readonly queryId: string
    readonly input: string
    readonly code?: string
    readonly trigger: Trigger
    readonly inputType?: string
    readonly queryContext: QueryContext
    readonly sourceId?: string
    readonly implicit?: boolean
    readonly codeQuery?: CodeQuery
    readonly codeSelection?: CodeSelection
    readonly headerInfo?: HeaderInfo
}

export type Trigger =
    | 'TerminalLink'
    | 'DebugError'
    | 'SearchBarInput'
    | 'SearchBarRefinement'
    | 'DiagnosticError'
    | 'CodeSelection'

export function isManualTrigger(trigger: Trigger): boolean {
    return trigger === 'SearchBarInput'
}
