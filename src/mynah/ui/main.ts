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
import './styles/frequent-apis.scss'

// @ts-ignore
export const createMynahUI = (initialData?: MynahUIDataModel) => {
    // Just the ones we use as context keys
    const contextKeyBasedNavigationTabs = [
        {
            value: 'docs',
            label: 'AWS Docs',
        },
        {
            value: 'code',
            label: 'Code',
        },
        {
            value: 'q&a',
            label: 'Q&A',
        },
    ]

    // Flat list of context keys used for navigation tabs
    const navigationTabContextKeys = contextKeyBasedNavigationTabs.map(navTab => navTab.value)

    const mainNavigationTab = {
        value: 'top-results',
        label: 'Top Results',
    }
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
        storeData: {
            ...initialData,
            invisibleContextItems: navigationTabContextKeys,
            navigationTabs: {
                selected: mainNavigationTab.value,
                tabs: [
                    // This one is not part of the context key tabs
                    mainNavigationTab,
                    ...contextKeyBasedNavigationTabs,
                ],
            },
        },
        onReady: connector.uiReady,
        onSearch: (payload: SearchPayload, isFromHistory, isFromAutocomplete) => {
            connector.requestSuggestions(payload, isFromHistory, isFromAutocomplete)

            if (isFromHistory) {
                // If the search is an historical one, try to find a matching one inside the mustHave policy group
                // with one of the context key based navigation tab items
                // In case there is more than one, the last one is enough for us (for backwards compatibility)
                const potentiallySelectedTab = navigationTabContextKeys.reduce(
                    (res: string | undefined, navTabContextKey: string) => {
                        if (payload.matchPolicy.must.includes(navTabContextKey)) {
                            return navTabContextKey
                        }
                        return res
                    },
                    undefined
                )

                mynahUI.updateStore({
                    liveSearchState: LiveSearchState.STOP,
                    navigationTabs: {
                        // If there is an item we can count it as the selected tab, if not switch to default
                        selected: potentiallySelectedTab ?? mainNavigationTab.value,
                        tabs: [mainNavigationTab, ...contextKeyBasedNavigationTabs],
                    },
                })
            } else {
                mynahUI.updateStore({ loading: true })
            }
        },
        onNavigationTabChange: (selectedTab: string) => {
            // grab the current search payload from UI
            const payload = Object.assign({}, mynahUI.getSearchPayload())

            // update the must have match policy with selected navigation tab
            // (remove all of the navigation bar context keys)
            payload.matchPolicy.must = payload.matchPolicy.must.filter(
                (contextKey: string) => !navigationTabContextKeys.includes(contextKey)
            )

            // Just add the selected one if it is in the context key navigation tab items)
            if (navigationTabContextKeys.includes(selectedTab)) {
                payload.matchPolicy.must.push(selectedTab)
            }

            // If search is possible
            if (payload.codeSelection.selectedCode.trim() !== '' || payload.query.trim() !== '') {
                // set loading state
                mynahUI.updateStore({ loading: true, liveSearchState: LiveSearchState.STOP })

                // perform a new search
                connector.requestSuggestions(payload)
            } else {
                // otherwise just update the match policy
                mynahUI.updateStore({
                    matchPolicy: { ...payload.matchPolicy },
                })
            }
        },
        onClickAutocompleteItem: connector.clickAutocompleteSuggestionItem,
        onChangeLiveSearchState: connector.toggleLiveSearch,
        onChangeContext: connector.recordContextChange,
        onClickCodeDetails: connector.clickCodeDetails,
        onClickSuggestionVote: connector.updateVoteOfSuggestion,
        onRequestHistoryRecords: connector.requestHistoryRecords,
        onSendFeedback: connector.sendFeedback,
        onSuggestionClipboardInteraction: connector.triggerSuggestionClipboardInteraction,
        onSuggestionEngagement: connector.triggerSuggestionEngagement,
        onSuggestionInteraction: connector.triggerSuggestionEvent,
        onResetStore: () => {
            mynahUI.updateStore({
                navigationTabs: {
                    selected: mainNavigationTab.value,
                    tabs: [mainNavigationTab, ...contextKeyBasedNavigationTabs],
                },
            })
            connector.resetStore()
        },
    })

    mynahUI.setStoreDefaults({ invisibleContextItems: navigationTabContextKeys })
}
