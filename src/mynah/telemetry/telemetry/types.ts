/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Queue } from './interfaces'

export interface TelemetryClientFactoryProps {
    readonly identityId: string | Promise<string>
    readonly environmentName: string
    readonly environmentVersion: string
    readonly mynahClientType: MynahClientType
    readonly mynahClientVersion?: string
}

export interface TelemetryClientProps {
    readonly environmentName: string
    readonly environmentVersion: string
    readonly mynahClientType: MynahClientType
    readonly mynahClientVersion?: string
    readonly operatingSystem: string
    readonly operatingSystemVersion: string
    readonly queue: Queue<TelemetryEvent>
}

export type TelemetryMetadata =
    | undefined
    | { readonly searchMetadata: SearchMetadata }
    | { readonly resultMetadata: ResultMetadata }
    | { readonly suggestionMetadata: SuggestionMetadata }
    | { readonly paginationMetadata: PaginationMetadata }
    | { readonly feedbackMetadata: FeedbackMetadata }
    | { readonly queryContextMetadata: QueryContextMetadata }
    | { readonly errorMetadata: ErrorMetadata }
    | { readonly fileEditMetadata: FileEditMetadata }
    | { readonly heartbeatMetadata: HeartbeatMetadata }
    | { readonly notificationMetadata: NotificationMetadata }
    | { readonly autocompleteMetadata: AutocompleteMetadata }
    | { readonly codeDetailsMetadata: CodeDetailsMetadata }

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
        start: { row: string; column?: string }
        end?: { row: string; column?: string }
    }
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

export interface CodeQuery {
    simpleNames: string[]
    usedFullyQualifiedNames: string[]
}

export interface ResultMetadata {
    resultCount: number
    latency: number
}

export interface SuggestionMetadata {
    suggestionId: string
    suggestionRank: number
    selectedText?: string
    hoverDuration?: number
    suggestionType?: string
}

export interface PaginationMetadata {
    pageNumber: number
}

export interface FeedbackMetadata {
    feedback?: string
    rating?: number
}

export interface QueryContextMetadata {
    queryContext: string
    queryContextType: string
    queryContextSource: string
}

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
}

export enum ErrorType {
    DIAGNOSTIC = 'DIAGNOSTIC',
    DEBUG = 'DEBUG',
    TERMINAL = 'TERMINAL',
}

export interface FileEditMetadata {
    fileName: string
    firstModifiedAt: Date
    lastModifiedAt: Date
    editCount: number
}
export interface HeartbeatMetadata {
    fileName: string
    languageId?: string
    isEdit: boolean
}
export interface TelemetryEvent {
    timestamp: Date
    id: string
    identityId?: string
    viewId: string
    name: TelemetryEventName
    clientType: MynahClientType
    clientVersion?: string
    environmentName: string
    environmentVersion: string
    operatingSystem: string
    operatingSystemVersion: string
    sessionId: string
    metadata: TelemetryMetadata
}

export enum MynahClientType {
    CANARY = 'CANARY',
    MYNAH_JETBRAINS = 'MYNAH_JETBRAINS',
    MYNAH_ECLIPSE = 'MYNAH_ECLIPSE',
    MYNAH_VISUAL_STUDIO = 'MYNAH_VISUAL_STUDIO',
    MYNAH_VISUAL_STUDIO_CODE = 'MYNAH_VISUAL_STUDIO_CODE',
    MYNAH_WEB = 'MYNAH_WEB',
}

export enum TelemetryEventName {
    INSTALL = 'INSTALL',
    UNINSTALL = 'UNINSTALL',
    SEARCH = 'SEARCH',
    SHOW_RESULTS = 'SHOW_RESULTS',
    CLICK_SUGGESTION = 'CLICK_SUGGESTION',
    SHARE_SUGGESTION = 'SHARE_SUGGESTION',
    COPY_SUGGESTION_LINK = 'COPY_SUGGESTION_LINK',
    UPVOTE_SUGGESTION = 'UPVOTE_SUGGESTION',
    DOWNVOTE_SUGGESTION = 'DOWNVOTE_SUGGESTION',
    STAR_RATE_SEARCH = 'STAR_RATE_SEARCH',
    ENTER_FEEDBACK = 'ENTER_FEEDBACK',
    GOTO_NEXT_PAGE = 'GOTO_NEXT_PAGE',
    ENTER_FOCUS = 'ENTER_FOCUS',
    LEAVE_FOCUS = 'LEAVE_FOCUS',
    ACTIVATE = 'ACTIVATE',
    DEACTIVATE = 'DEACTIVATE',
    ADD_QUERY_CONTEXT = 'ADD_QUERY_CONTEXT',
    REMOVE_QUERY_CONTEXT = 'REMOVE_QUERY_CONTEXT',
    OPEN_SUGGESTION_LINK = 'OPEN_SUGGESTION_LINK',
    CLICK_SEARCH_HISTORY = 'CLICK_SEARCH_HISTORY',
    OPEN_SEARCH_HISTORY = 'OPEN_SEARCH_HISTORY',
    CLICK_SEARCH_HISTORY_ITEM = 'CLICK_SEARCH_HISTORY_ITEM',
    OBSERVE_ERROR = 'OBSERVE_ERROR',
    CLEAR_ERROR = 'CLEAR_ERROR',
    EDIT_FILE = 'EDIT_FILE',
    HEARTBEAT = 'HEARTBEAT',
    HOVER_SUGGESTION = 'HOVER_SUGGESTION',
    SELECT_SUGGESTION_TEXT = 'SELECT_SUGGESTION_TEXT',
    VIEW_NOTIFICATION = 'VIEW_NOTIFICATION',
    CLICK_NOTIFICATION = 'CLICK_NOTIFICATION',
    PAUSE_LIVE_SEARCH = 'PAUSE_LIVE_SEARCH',
    RESUME_LUVE_SEARCH = 'RESUME_LIVE_SEARCH',
    REFINE_LIVE_SEARCH = 'REFINE_LIVE_SEARCH',
    SELECT_AUTOCOMPLETE_QUERY_TEXT = 'SELECT_AUTOCOMPLETE_QUERY_TEXT',
    CLICK_CODE_DETAILS = 'CLICK_CODE_DETAILS',
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
}
