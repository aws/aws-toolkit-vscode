/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    FeedbackPayload,
    RelevancyVoteType,
    LiveSearchState,
    SearchPayload,
    Suggestion,
    ContextType,
    EngagementType,
    SuggestionEngagement,
    MynahUIDataModel,
    ContextChangeType,
    SuggestionEventName,
    SearchHistoryFilters,
} from '@aws/mynah-ui'
import { SearchTrigger } from '../telemetry/telemetry/types'

export interface ConnectorProps {
    postMessageHandler: (message: Record<string, any>) => void
    onMessageReceived?: (messageData: any) => void
    onError?: (error: { message: string; title?: string }) => void
}
export class Connector {
    private readonly postMessageHandler
    private readonly onMessageReceived
    private readonly onError
    constructor(props: ConnectorProps) {
        this.postMessageHandler = props.postMessageHandler
        this.onMessageReceived = props.onMessageReceived
        this.onError =
            props.onError ??
            ((error: { message: string; title?: string }) => {
                console.warn(error.message)
            })
    }

    private readonly parseMessageData = (data: string): any => {
        try {
            return JSON.parse(data)
        } catch (err) {
            return undefined
        }
    }

    private readonly handleMessageRecieve = (message: MessageEvent): void => {
        if (typeof message.data !== 'string') {
            return
        }
        const messageData = this.parseMessageData(message.data)

        if (messageData !== undefined && messageData.sender === 'mynah') {
            if (messageData.error) {
                this.onError(messageData.error)
            } else {
                const mappedReceivedMessage: MynahUIDataModel = {}
                if (messageData.autocompleteList !== undefined) {
                    mappedReceivedMessage.autoCompleteSuggestions = messageData.autocompleteList
                }
                if (messageData.suggestions !== undefined) {
                    mappedReceivedMessage.suggestions = messageData.suggestions
                    mappedReceivedMessage.loading = false
                }
                if (messageData.searchHistoryRecords !== undefined) {
                    mappedReceivedMessage.searchHistory = messageData.searchHistoryRecords
                }
                if (messageData.queryText !== undefined || messageData.query !== undefined) {
                    mappedReceivedMessage.query = messageData.queryText ?? messageData.query
                }
                if (messageData.queryContext !== undefined) {
                    mappedReceivedMessage.matchPolicy = messageData.queryContext
                }
                if (messageData.codeQuery !== undefined) {
                    mappedReceivedMessage.codeQuery = messageData.codeQuery
                }
                if (messageData.code !== undefined) {
                    mappedReceivedMessage.code = messageData.code
                }
                if (messageData.codeSelection !== undefined) {
                    mappedReceivedMessage.codeSelection = messageData.codeSelection
                }

                if (messageData.headerInfo !== undefined) {
                    mappedReceivedMessage.headerInfo = messageData.headerInfo
                }

                if (messageData.liveSearchAction !== undefined) {
                    mappedReceivedMessage.liveSearchState = messageData.liveSearchAction
                }

                if (this.onMessageReceived !== undefined) {
                    this.onMessageReceived(mappedReceivedMessage)
                }
            }
        }
    }

    uiReady = (): void => {
        this.postMessageHandler({
            command: 'uiReady',
        })
        if (this.onMessageReceived !== undefined) {
            window.addEventListener('message', this.handleMessageRecieve.bind(this))
        }
    }

    requestSuggestions = (
        searchPayload: SearchPayload,
        isFromHistory?: boolean,
        isFromAutocomplete?: boolean
    ): void => {
        this.postMessageHandler({
            command: 'search',
            text: searchPayload.query,
            context: searchPayload.matchPolicy,
            code: searchPayload.code,
            ...(searchPayload.codeSelection?.selectedCode !== '' ? { codeSelection: searchPayload.codeSelection } : {}),
            codeQuery: searchPayload.codeQuery,
            isFromAutocomplete,
            ...(isFromHistory === true ? { trigger: SearchTrigger.SEARCH_HISTORY } : {}),
        })
    }

    updateVoteOfSuggestion = (suggestion: Suggestion, vote: RelevancyVoteType): void => {
        this.postMessageHandler({
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
        this.postMessageHandler({
            command: 'clickCodeDetails',
            code,
            fileName,
            range,
        })
    }

    recordContextChange = (changeType: ContextChangeType, queryContext: ContextType): void => {
        switch (changeType) {
            case ContextChangeType.ADD:
                this.postMessageHandler({
                    command: 'addQueryContext',
                    queryContext,
                })
                break
            case ContextChangeType.REMOVE:
                this.postMessageHandler({
                    command: 'removeQueryContext',
                    queryContext,
                })
                break
            default:
                break
        }
    }

    triggerSuggestionEngagement = (engagement: SuggestionEngagement): void => {
        let command: string = 'hoverSuggestion'
        if (
            engagement.engagementType === EngagementType.INTERACTION &&
            engagement.selectionDistanceTraveled?.selectedText !== undefined
        ) {
            command = 'selectSuggestionText'
        }
        this.postMessageHandler({
            command,
            suggestionId: engagement.suggestion.url,
            suggestionRank: parseInt(engagement.suggestion.id),
            suggestionType: engagement.suggestion.type,
            selectedText: engagement.selectionDistanceTraveled?.selectedText,
            hoverDuration: engagement.engagementDurationTillTrigger / 1000, // seconds
        })
    }

    triggerSuggestionClipboardInteraction = (suggestionId: string, type?: string, text?: string): void => {
        this.postMessageHandler({
            command: 'suggestionBodyCopiedToClipboard',
            suggestionId,
            type: type ?? 'none',
            selectedText: text ?? '',
        })
    }

    triggerSuggestionEvent = (eventName: SuggestionEventName, suggestion: Suggestion): void => {
        this.postMessageHandler({
            command: eventName,
            suggestionId: suggestion.url,
            suggestionRank: parseInt(suggestion.id),
            suggestionType: suggestion.type,
        })
    }

    sendFeedback = (feedbackPayload: FeedbackPayload): void => {
        this.postMessageHandler({
            command:
                feedbackPayload.comment !== undefined && feedbackPayload.comment.trim() !== '' ? 'feedback' : 'stars',
            feedback: feedbackPayload.comment,
            rating: feedbackPayload.stars,
        })
    }

    requestHistoryRecords = (filterPayload: SearchHistoryFilters): void => {
        this.postMessageHandler({
            command: 'getSearchHistory',
            filters: filterPayload,
        })
    }

    requestAutocomplete = (input: string): void => {
        this.postMessageHandler({
            command: 'getAutocomplete',
            input,
        })
    }

    toggleLiveSearch = (liveSearchState: LiveSearchState): void => {
        this.postMessageHandler({
            command: 'liveSearch',
            liveSearchState,
        })
    }

    clickAutocompleteSuggestionItem = (text: string, currSelected?: number, suggestionCount?: number): void => {
        this.postMessageHandler({
            command: 'selectAutocompleteSuggestion',
            text,
            autocompleteSuggestionSelected: currSelected,
            autocompleteSuggestionsCount: suggestionCount,
        })
    }
}
