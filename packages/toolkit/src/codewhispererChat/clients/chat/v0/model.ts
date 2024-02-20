/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
export type ContextKey = string
export type ContextKeys = ContextKey[]

export interface MatchPolicy {
    readonly should?: ContextKeys
    readonly must?: ContextKeys
    readonly mustNot?: ContextKeys
}

export interface Context {
    readonly matchPolicy?: MatchPolicy
}

export interface FullyQualifiedName {
    readonly source?: SourceIdentifier
    readonly symbol?: SymbolIdentifier
}

export type FullyQualifiedNamesUsages = FullyQualifiedName[]

export type Name = string

export type SymbolIdentifier = Name[]

export type SourceIdentifier = Name[]
export type FullyQualifiedNames = FullyQualifiedName[]
export interface FullyQualifiedNamesDeclarationsUsages {
    readonly used?: FullyQualifiedNamesUsages
}

export type SimpleName = string
export type SimpleNames = SimpleName[]

export interface CodeQuery {
    readonly simpleNames?: SimpleNames
    readonly fullyQualifiedNames?: FullyQualifiedNamesDeclarationsUsages
}

export interface EditorContext {
    readonly fileContent?: string
    readonly language?: string
    readonly query?: string
    readonly code?: string
    readonly context?: Context
    readonly codeQuery?: CodeQuery
}

export enum ApiDocsType {
    RequestMatchedFqn,
    RelatedFrequentlyUsedFqn,
}

class ApiDocsMetadata {
    constructor(public canonicalExample?: CanonicalExample) {}
}

class CanonicalExample {
    constructor(public url: string, public body: string) {}
}

export interface ChatApiDocsSuggestion {
    readonly url?: string
    readonly title?: string
    readonly body?: string
    readonly ancestor?: string | null
    readonly type: ApiDocsType
    readonly metadata?: ApiDocsMetadata
}

export interface ChatSuggestion {
    readonly url: string
    readonly title: string
    readonly body: string
    readonly context: string[]
    readonly metadata: SuggestionMetadata
    readonly type: string
}

interface StackExchangeMetadata {
    readonly answerCount: number
    readonly isAccepted: boolean
    readonly score: number
    readonly lastActivityDate: number
}

interface SuggestionMetadata {
    readonly StackOverflow?: StackExchangeMetadata
    readonly StackExchange?: StackExchangeMetadata
}

export interface FollowUp {
    readonly type: FollowUpType
    readonly message?: string
    readonly attachedSuggestions?: ChatSuggestion[]
    readonly attachedApiDocsSuggestions?: ChatApiDocsSuggestion[]
}

export interface ChatRequest {
    readonly message: string
    readonly editorContext: EditorContext
    readonly attachedSuggestions: ChatSuggestion[]
    readonly attachedApiDocsSuggestions: ChatApiDocsSuggestion[]
}
export interface FollowUpRequest {
    readonly followUp: FollowUp
    readonly editorContext?: EditorContext
}

export interface IdeTriggerRequest {
    readonly trigger: string
    readonly editorContext?: EditorContext
}

// @ts-ignore
export interface ChatEvent {
    readonly messageId: string
    readonly header?: Header
    readonly token?: string
    readonly followUps?: SuggestedFollowUp[]
    readonly suggestions?: ChatSuggestion[]
    readonly query?: string
}

interface Header {
    readonly sender: string
    readonly responseTo: string
    readonly sequenceId: string
}

export enum FollowUpType {
    Alternatives,
    CommonPractices,
    Improvements,
    MoreExamples,
    CiteSources,
    LineByLine,
    ExplainInDetail,
    Generated,
}

interface SuggestedFollowUp {
    readonly type: FollowUpType
    readonly pillText?: string
    readonly prompt?: string
    readonly message?: string
    readonly attachedSuggestions?: ChatSuggestion[]
    readonly attachedApiDocsSuggestions?: ChatApiDocsSuggestion[]
}
