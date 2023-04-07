/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { NotificationType } from '@aws/mynah-ui'
import { Range } from 'vscode-languageserver-protocol'
import { ApiDocsSuggestion } from '../client/mynahclient'

export const MynahInstallationStoreKey = 'mynah-installed'

export abstract class SearchInput {
    public abstract searchText(
        newInput: string,
        queryContext: QueryContext,
        code?: string,
        queryId?: string,
        codeQuery?: CodeQuery,
        codeSelection?: CodeSelection,
        selectedTab?: string,
        uiRequestId?: string
    ): Promise<void>
}

export interface SearchOutput {
    readonly query: Query
    readonly suggestions: Promise<SearchSuggestion[] | ApiDocsSuggestion[]>
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

export interface FullyQualifiedName {
    readonly source: string[]
    readonly symbol: string[]
}

export interface CodeQuery {
    simpleNames: string[]
    fullyQualifiedNames: {
        used: FullyQualifiedName[]
    }
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
    readonly selectedTab?: string
    readonly uiRequestId?: string
}

export enum NavigationTabItems {
    top = 'top',
    docs = 'docs',
    apiDocs = 'api-docs',
    blog = 'blog',
    code = 'code',
    qA = 'q&a',
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
