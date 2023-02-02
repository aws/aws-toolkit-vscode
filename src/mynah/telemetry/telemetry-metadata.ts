/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ErrorMetadata {
    message: string
    severity: string
    source?: string
    errorCode?: string
    code?: string
    errorId: string
    file: string
    type?: ErrorType
    languageId?: string
    imports?: string[]
    stackTrace?: string
    state: ErrorState
}

export enum ErrorType {
    DIAGNOSTIC = 'DIAGNOSTIC',
    DEBUG = 'DEBUG',
    TERMINAL = 'TERMINAL',
}

export enum ErrorState {
    NEW = 'NEW',
    CLEARED = 'CLEARED',
}

export interface SearchMetadata {
    query: string
    queryContext?: QueryContext
    trigger: SearchTrigger
    triggerInteractionType?: TriggerInteractionType
    code?: string
    sourceId?: string
    codeQuery?: CodeQuery
    implicit?: boolean
    fromAutocomplete?: boolean
}
export interface QueryContext {
    should?: string[]
    must?: string[]
    mustNot?: string[]
}

export enum SearchTrigger {
    DEBUG_ERROR = 'DEBUG_ERROR',
    DIAGNOSTIC_ERROR = 'DIAGNOSTIC_ERROR',
    GLOBAL_SEARCH = 'GLOBAL_SEARCH',
    SEARCH_PANE = 'SEARCH_PANE',
    TERMINAL = 'TERMINAL',
    SEARCH_HISTORY = 'SEARCH_HISTORY',
    CODE_SELECTION = 'CODE_SELECTION',
}

export enum TriggerInteractionType {
    KEYBOARD = 'KEYBOARD',
    CLICK = 'CLICK',
    MENU = 'MENU',
    HOVER_BUBBLE = 'HOVER_BUBBLE',
    STATUS_BAR = 'STATUS_BAR',
    FIRST_INSTALL = 'FIRST_INSTALL',
}
export interface CodeQuery {
    simpleNames: string[]
    usedFullyQualifiedNames: string[]
}
export interface HeartbeatMetadata {
    fileName: string
    languageId?: string
    isEdit: boolean
}

export interface SuggestionMetadata {
    suggestionId: string
    suggestionRank: number
    selectedText?: string
    hoverDuration?: number
    suggestionType?: string
    interactionType: InteractionType
}

export enum InteractionType {
    OPEN = 'OPEN',
    UPVOTE = 'UPVOTE',
    DOWNVOTE = 'DOWNVOTE',
    HOVER = 'HOVER',
    SELECT_TEXT = 'SELECT_TEXT',
    COPY = 'COPY',
}
export interface ResultMetadata {
    resultCount: number
    latency: number
    suggestions: string[]
}
export interface FeedbackMetadata {
    feedback?: string
    rating?: number
    type: FeedbackType
}

export enum FeedbackType {
    TEXT = 'TEXT',
    RATING = 'RATING',
}

export interface QueryContextMetadata {
    queryContext: string
    queryContextType: string
    queryContextSource: string
    operation: QueryContextOperation
}

export enum QueryContextOperation {
    ADD = 'ADD',
    REMOVE = 'REMOVE',
}

export interface NotificationMetadata {
    name: string
    action?: string
}

export interface AutocompleteMetadata {
    input: string
    selectedItem: number
    suggestionsCount: number
}

export interface CodeDetailsMetadata {
    code: string
    fileName?: string
    range?: {
        startLine: { row: string; col?: string }
        endLine?: { row: string; col?: string }
    }
}

export interface PanelMetadata {
    state: PanelState
}

export enum PanelState {
    IN_FOCUS = 'IN_FOCUS',
    OUT_OF_FOCUS = 'OUT_OF_FOCUS',
}

export interface ExtensionMetadata {
    state: ExtensionState
}

export enum ExtensionState {
    ACTIVE = 'ACTIVE',
    INACTIVE = 'INACTIVE',
}

export interface LiveSearchMetadata {
    state: LiveSearchState
}

export enum LiveSearchState {
    START = 'START',
    PAUSE = 'PAUSE',
    RESUME = 'RESUME',
    STOP = 'STOP',
}
