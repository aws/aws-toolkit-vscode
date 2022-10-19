/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { FeedbackPayload } from '../components/feedback-form/feedback-form'
import { RelevancyVoteType } from '../components/suggestion-card/suggestion-card-relevance-vote'
import { ContextType } from './context-manager'
import { LiveSearchState, SearchPayload, Suggestion } from './static'
import { SearchHistoryFilters } from '../../stores/searchHistoryStore'
import { SearchHistoryItem } from '../components/search-block/search-history-content'
import { EngagementType, SuggestionEngagement } from '../components/suggestion-card/suggestion-card'
import { AutocompleteItem } from '../components/search-block/autocomplete-content'

export enum ContextChangeType {
    'ADD' = 'add',
    'REMOVE' = 'remove',
}
export enum SuggestionEventName {
    CLICK = 'click',
    OPEN = 'openSuggestion',
    COPY = 'copy',
}

export class ServiceConnector {
    // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
    private liveSearchHandler?: (searchPayload?: SearchPayload, suggestions?: Suggestion[]) => void | undefined
    private liveSearchStateExternalChangeHandler?: ((state: LiveSearchState) => void) | undefined
    private waiterToken:
        | {
              resolve: (result: any) => void
              reject?: (result: string) => void
              command?: string
          }
        | undefined = undefined

    constructor() {
        window.addEventListener('message', this.handleMessageRecieve.bind(this))
    }

    private readonly parseMessageData: any = function (data: string) {
        try {
            return JSON.parse(data)
        } catch (err) {
            return undefined
        }
    }

    private readonly handleMessageRecieve = (message: MessageEvent): void => {
        // Temporary fix to only handle message sent by Mynah webview,
        // currently this method is also capturing some other message sent globally
        // Dogus will be working on a more secure fix soon
        if (typeof message.data !== 'string') {
            return
        }
        const messageData = this.parseMessageData(message.data)
        if (this.liveSearchStateExternalChangeHandler !== undefined && messageData.liveSearchAction !== undefined) {
            this.liveSearchStateExternalChangeHandler(messageData.liveSearchAction)
        } else if (this.waiterToken !== undefined || this.liveSearchHandler !== undefined) {
            if (message.data !== undefined && this.parseMessageData(message.data) !== undefined) {
                if (this.waiterToken !== undefined) {
                    switch (this.waiterToken.command) {
                        case 'search':
                            // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
                            if (messageData.autocompleteList) {
                                return
                            }
                            if (typeof messageData.suggestions === 'string' && this.waiterToken.reject !== undefined) {
                                this.waiterToken.reject(messageData.suggestions)
                                // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
                            } else if (messageData.suggestions) {
                                this.waiterToken.resolve(messageData.suggestions)
                            } else if (this.waiterToken.reject !== undefined) {
                                this.waiterToken.reject("Couldn't get suggestions")
                            }
                            break
                        case 'getSearchHistory':
                            if (
                                typeof messageData.searchHistoryRecords === 'string' &&
                                this.waiterToken.reject !== undefined
                            ) {
                                this.waiterToken.reject(messageData.searchHistoryRecords)
                                // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
                            } else if (messageData.searchHistoryRecords) {
                                this.waiterToken.resolve(messageData.searchHistoryRecords)
                            } else if (this.waiterToken.reject !== undefined) {
                                this.waiterToken.reject("Couldn't get search history records")
                            }
                            break
                        case 'getAutocomplete':
                            if (
                                typeof messageData.autocompleteList === 'string' &&
                                this.waiterToken.reject !== undefined
                            ) {
                                this.waiterToken.reject(messageData.autocompleteList)
                            } else if (messageData.autocompleteList !== undefined) {
                                this.waiterToken.resolve(messageData.autocompleteList)
                            } else if (this.waiterToken.reject !== undefined) {
                                this.waiterToken.reject("Couldn't get autocompleteList")
                            }
                            break
                    }
                } else if (this.liveSearchHandler !== undefined) {
                    if (messageData.suggestions !== undefined && messageData.queryText !== undefined) {
                        this.liveSearchHandler(
                            {
                                query: messageData.queryText,
                                matchPolicy: messageData.context,
                                codeSelection: messageData.codeSelection,
                            },
                            messageData.suggestions
                        )
                    }
                }
            } else if (this.waiterToken?.reject !== undefined) {
                this.waiterToken.reject("Couldn't get data")
            }

            this.waiterToken = undefined
        }
    }

    uiReady = (): void =>
        window.ideApi.postMessage({
            command: 'uiReady',
        })

    once = async (): Promise<Suggestion[]> => {
        const onceAsyncHandle = new Promise<Suggestion[]>(
            (resolve: (suggestions: Suggestion[]) => void, reject: (reason: string) => void) => {
                this.waiterToken = { resolve, reject, command: 'search' }
            }
        )
        return await onceAsyncHandle
    }

    requestSuggestions = async (
        searchPayload: SearchPayload,
        isFromHistory?: boolean,
        isFromAutocomplete?: boolean
    ): Promise<Suggestion[] | undefined> => {
        const serviceAsyncHandle = new Promise<Suggestion[] | undefined>(
            (resolve: (suggestions?: Suggestion[]) => void, reject: (reason: string) => void) => {
                window.ideApi.postMessage({
                    command: 'search',
                    text: searchPayload.query,
                    context: searchPayload.matchPolicy,
                    codeSelection: searchPayload.codeSelection,
                    codeQuery: searchPayload.codeQuery,
                    isFromAutocomplete,
                    ...((isFromHistory ?? false) && { trigger: 'SEARCH_HISTORY' }),
                })
                if (isFromHistory ?? false) {
                    resolve()
                } else {
                    this.waiterToken = { resolve, reject, command: 'search' }
                }
            }
        )
        return await serviceAsyncHandle
    }

    updateVoteOfSuggestion = (suggestion: Suggestion, vote: RelevancyVoteType): void => {
        window.ideApi.postMessage({
            command: vote,
            suggestionId: suggestion.url,
            suggestionRank: suggestion.id,
            suggestionType: suggestion.type,
        })
    }

    clickCodeDetails = (
        code: string,
        fileName?: string,
        range?: {
            start: { row: string; column?: string }
            end?: { row: string; column?: string }
        }
    ): void => {
        window.ideApi.postMessage({
            command: 'clickCodeDetails',
            code,
            fileName,
            range,
        })
    }

    recordContextChange = (changeType: ContextChangeType, queryContext: ContextType): void => {
        switch (changeType) {
            case ContextChangeType.ADD:
                window.ideApi.postMessage({
                    command: 'addQueryContext',
                    queryContext,
                })
                break
            case ContextChangeType.REMOVE:
                window.ideApi.postMessage({
                    command: 'removeQueryContext',
                    queryContext,
                })
                break
            default:
                break
        }
    }

    triggerSuggestionEngagement = (engagement: SuggestionEngagement): void => {
        switch (engagement.engagementType) {
            case EngagementType.INTERACTION:
                if (engagement.selectionDistanceTraveled?.selectedText !== undefined) {
                    window.ideApi.postMessage({
                        command: 'selectSuggestionText',
                        suggestionId: engagement.suggestion.url,
                        suggestionRank: parseInt(engagement.suggestion.id),
                        suggestionType: engagement.suggestion.type,
                        selectedText: engagement.selectionDistanceTraveled.selectedText,
                    })
                }
                break
            case EngagementType.TIME:
                window.ideApi.postMessage({
                    command: 'hoverSuggestion',
                    suggestionId: engagement.suggestion.url,
                    suggestionRank: parseInt(engagement.suggestion.id),
                    suggestionType: engagement.suggestion.type,
                    hoverDuration: engagement.engagementDurationTillTrigger / 1000, // seconds
                })
                break
        }
    }

    triggerSuggestionClipboardInteraction = (suggestionId: string, type?: string, text?: string): void => {
        window.ideApi.postMessage({
            command: 'suggestionBodyCopiedToClipboard',
            suggestionId,
            type: type ?? 'none',
            selectedText: text ?? '',
        })
    }

    triggerSuggestionEvent = (eventName: SuggestionEventName, suggestion: Suggestion): void => {
        window.ideApi.postMessage({
            command: eventName,
            suggestionId: suggestion.url,
            suggestionRank: parseInt(suggestion.id),
            suggestionType: suggestion.type,
        })
    }

    sendFeedback = (feedbackPayload: FeedbackPayload): void => {
        window.ideApi.postMessage({
            command:
                feedbackPayload.comment !== undefined && feedbackPayload.comment.trim() !== '' ? 'feedback' : 'stars',
            feedback: feedbackPayload.comment,
            rating: feedbackPayload.stars,
        })
    }

    requestHistoryRecords = async (filterPayload: SearchHistoryFilters): Promise<SearchHistoryItem[]> => {
        const serviceAsyncHandle = new Promise<SearchHistoryItem[]>(
            (resolve: (suggestions: SearchHistoryItem[]) => void, reject: (reason: string) => void) => {
                this.waiterToken = { resolve, reject, command: 'getSearchHistory' }
                window.ideApi.postMessage({
                    command: 'getSearchHistory',
                    filters: filterPayload,
                })
            }
        )
        return await serviceAsyncHandle
    }

    requestAutocomplete = async (input: string): Promise<AutocompleteItem[]> => {
        const serviceAsyncHandle = new Promise<AutocompleteItem[]>(
            (resolve: (suggestions: AutocompleteItem[]) => void, reject: (reason: string) => void) => {
                this.waiterToken = { resolve, reject, command: 'getAutocomplete' }
                window.ideApi.postMessage({
                    command: 'getAutocomplete',
                    input,
                })
            }
        )
        return await serviceAsyncHandle
    }

    toggleLiveSearch = (
        liveSearchState: LiveSearchState,
        onFeedReceived: (searchPayload?: SearchPayload, suggestions?: Suggestion[]) => void
    ): void => {
        window.ideApi.postMessage({
            command: 'liveSearch',
            liveSearchState,
        })
        if (liveSearchState === LiveSearchState.RESUME) {
            this.registerLiveSearchHandler(onFeedReceived)
        } else {
            this.liveSearchHandler = undefined
        }
    }

    registerLiveSearchHandler = (
        onLiveSearchDataReceived: (searchPayload?: SearchPayload, suggestions?: Suggestion[]) => void,
        onStateChangedExternally?: (state: LiveSearchState) => void
    ): void => {
        this.liveSearchHandler = onLiveSearchDataReceived
        if (onStateChangedExternally !== undefined) {
            this.liveSearchStateExternalChangeHandler = onStateChangedExternally
        }
    }

    publishAutocompleteSuggestionSelectedEvent = (
        text: string,
        currSelected?: number,
        suggestionCount?: number
    ): void => {
        window.ideApi.postMessage({
            command: 'selectAutocompleteSuggestion',
            text,
            autocompleteSuggestionSelected: currSelected,
            autocompleteSuggestionsCount: suggestionCount,
        })
    }
}
