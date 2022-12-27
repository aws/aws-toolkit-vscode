/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Connector } from './connector'
import { LiveSearchState, MynahUI, MynahUIDataModel, NotificationType, SearchPayload } from '@aws/mynah-ui'
import './styles/variables.scss'
import './styles/dark.scss'
import './styles/icons.scss'
import './styles/source-thumbs.scss'

// @ts-ignore
export const createMynahUI = (initialData?: MynahUIDataModel) => {
    // eslint-disable-next-line prefer-const
    let mynahUI: MynahUI
    const ideApi = acquireVsCodeApi()
    const connector = new Connector({
        postMessageHandler: message => {
            ideApi.postMessage(message)
        },
        onMessageReceived: (messageData: MynahUIDataModel) => {
            mynahUI.updateStore(messageData)
        },
        onError: (error: { message: string; title?: string }) => {
            mynahUI.notify({
                content: error.message,
                type: NotificationType.ERROR,
            })
        },
    })

    mynahUI = new MynahUI({
        storeData: initialData,
        onReady: connector.uiReady,
        onSearch: (payload: SearchPayload, isFromHistory, isFromAutocomplete) => {
            connector.requestSuggestions(payload, isFromHistory, isFromAutocomplete)
            if (isFromHistory) {
                mynahUI.updateStore({ liveSearchState: LiveSearchState.STOP })
            } else {
                mynahUI.updateStore({ loading: true })
            }
        },
        onClickAutocompleteItem: connector.clickAutocompleteSuggestionItem,
        onChangeLiveSearchState: connector.toggleLiveSearch,
        onRequestAutocompleteList: connector.requestAutocomplete,
        onChangeContext: connector.recordContextChange,
        onClickCodeDetails: connector.clickCodeDetails,
        onClickSuggestionVote: connector.updateVoteOfSuggestion,
        onRequestHistoryRecords: connector.requestHistoryRecords,
        onSendFeedback: connector.sendFeedback,
        onSuggestionClipboardInteraction: connector.triggerSuggestionClipboardInteraction,
        onSuggestionEngagement: connector.triggerSuggestionEngagement,
        onSuggestionInteraction: connector.triggerSuggestionEvent,
    })
}
