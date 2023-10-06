/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
export type ContextKey = string
export type ContextKeys = ContextKey[]

export interface MatchPolicy {
    should?: ContextKeys
    must?: ContextKeys
    mustNot?: ContextKeys
}

export interface Context {
    matchPolicy?: MatchPolicy
}

export interface FullyQualifiedName {
    source?: SourceIdentifier
    symbol?: SymbolIdentifier
}

export type FullyQualifiedNamesUsages = FullyQualifiedName[]

export type Name = string

export type SymbolIdentifier = Name[]

export type SourceIdentifier = Name[]
export type FullyQualifiedNames = FullyQualifiedName[]
export interface FullyQualifiedNamesDeclarationsUsages {
    used?: FullyQualifiedNamesUsages
}

export type SimpleName = string
export type SimpleNames = SimpleName[]

export interface CodeQuery {
    simpleNames?: SimpleNames
    fullyQualifiedNames?: FullyQualifiedNamesDeclarationsUsages
}

export interface EditorContext {
    fileContent?: string
    language?: string
    query?: string
    code?: string
    context?: Context
    codeQuery?: CodeQuery
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
    url?: string
    title?: string
    body?: string
    ancestor?: string | null
    type: ApiDocsType
    metadata?: ApiDocsMetadata
}

export interface ChatSuggestion {
    url: string
    title: string
    body: string
    context: string[]
    metadata: SuggestionMetadata
    type: string
}

interface StackExchangeMetadata {
    answerCount: number
    isAccepted: boolean
    score: number
    lastActivityDate: number
}

interface SuggestionMetadata {
    StackOverflow?: StackExchangeMetadata
    StackExchange?: StackExchangeMetadata
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
    messageId: string
    header?: Header
    token?: string
    followUps?: SuggestedFollowUp[]
    suggestions?: ChatSuggestion[]
    query?: string
}

interface Header {
    sender: string
    responseTo: string
    sequenceId: string
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
    type: FollowUpType
    pillText?: string
    prompt?: string
    message?: string
    attachedSuggestions?: ChatSuggestion[]
    attachedApiDocsSuggestions?: ChatApiDocsSuggestion[]
}
