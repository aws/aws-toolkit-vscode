/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Connector } from './connector'
import {
    LiveSearchState,
    MynahUI,
    MynahUIDataModel,
    NotificationType,
    PayloadTransformRule,
    SearchPayload,
    transformPayloadData,
} from '@aws/mynah-ui'
import './styles/variables.scss'
import './styles/dark.scss'
import './styles/icons.scss'
import './styles/source-thumbs.scss'
import './styles/frequent-apis.scss'
import { ToggleOption } from '@aws/mynah-ui/dist/components/toggle'

export const NavigationTabs = {
    top: {
        value: 'top',
        label: 'Top Picks',
    },
    docs: {
        value: 'docs',
        label: 'AWS Docs',
    },
    apiDocs: {
        value: 'api-docs',
        label: 'API Docs',
        disabled: true,
    },
    blog: {
        value: 'blog',
        label: 'Blog Post',
    },
    code: {
        value: 'code',
        label: 'Code',
    },
    qA: {
        value: 'q&a',
        label: 'Q&A',
    },
}

const getTabs = (selectedTab?: string, disabledTabs?: string[]): ToggleOption[] => {
    const selected = selectedTab ?? NavigationTabs.top.value
    const disabled = disabledTabs ?? [NavigationTabs.apiDocs.value]
    const defaults = [
        NavigationTabs.top,
        NavigationTabs.docs,
        NavigationTabs.apiDocs,
        NavigationTabs.blog,
        NavigationTabs.code,
        NavigationTabs.qA,
    ]
    return defaults.map(tabItem => ({
        ...tabItem,
        selected: selected === tabItem.value,
        disabled: disabled.includes(tabItem.value),
    }))
}

const contextItemsUsedAsTabs = ['code', 'q&a', 'docs']
const baseRules: Record<string, PayloadTransformRule> = {
    removeAllFromMust: { targetRoute: ['matchPolicy', 'must'], method: 'remove', values: contextItemsUsedAsTabs },
    removeAllFromMustNot: { targetRoute: ['matchPolicy', 'mustNot'], method: 'remove', values: contextItemsUsedAsTabs },
    addAllToMustNot: { targetRoute: ['matchPolicy', 'mustNot'], method: 'add', values: contextItemsUsedAsTabs },
}

// @ts-ignore
export const createMynahUI = (initialData?: MynahUIDataModel) => {
    // Rules based on tab option value
    const navigationTabRules: Record<string, PayloadTransformRule[]> = {
        top: [baseRules.removeAllFromMustNot, baseRules.removeAllFromMust],
        'api-docs': [baseRules.removeAllFromMustNot, baseRules.removeAllFromMust],
        docs: [
            baseRules.removeAllFromMustNot,
            baseRules.removeAllFromMust,
            // Add docs to must
            { targetRoute: ['matchPolicy', 'must'], method: 'add', value: 'docs' },
        ],
        code: [
            baseRules.removeAllFromMustNot,
            baseRules.removeAllFromMust,
            // Add code to must
            { targetRoute: ['matchPolicy', 'must'], method: 'add', value: 'code' },
        ],
        'q&a': [
            baseRules.removeAllFromMustNot,
            baseRules.removeAllFromMust,
            // Add q&a to must
            { targetRoute: ['matchPolicy', 'must'], method: 'add', value: 'q&a' },
        ],
        blog: [baseRules.removeAllFromMust, baseRules.addAllToMustNot],
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
            invisibleContextItems: contextItemsUsedAsTabs,
            navigationTabs: getTabs(
                NavigationTabs.top.value,
                (initialData?.codeQuery?.usedFullyQualifiedNames ?? []).length > 0 ? [] : [NavigationTabs.apiDocs.value]
            ),
        },
        onReady: connector.uiReady,
        onSearch: (payload: SearchPayload, isFromHistory, isFromAutocomplete): void | MynahUIDataModel => {
            connector.requestSuggestions(payload, isFromHistory, isFromAutocomplete)

            if (isFromHistory) {
                const selectedTab = payload.selectedTab ?? NavigationTabs.top.value
                const disabledTabs =
                    selectedTab === NavigationTabs.apiDocs.value ||
                    (payload.codeQuery?.usedFullyQualifiedNames ?? []).length > 0
                        ? []
                        : [NavigationTabs.apiDocs.value]
                return {
                    liveSearchState: LiveSearchState.STOP,
                    navigationTabs: getTabs(selectedTab, disabledTabs),
                    loading: false,
                }
            } else {
                return {
                    loading: true,
                }
            }
        },
        onNavigationTabChange: (selectedTab: string) => {
            connector.tabChanged(selectedTab)

            // Grab the current search payload from UI
            // Apply rules to transform the payload according to the tab selecton
            const payload = transformPayloadData(
                navigationTabRules[selectedTab],
                Object.assign({}, mynahUI.getSearchPayload())
            )

            // If search is possible
            if (payload.codeSelection.selectedCode.trim() !== '' || payload.query.trim() !== '') {
                // set loading state
                mynahUI.updateStore({ loading: true, liveSearchState: LiveSearchState.STOP })

                // perform a new search
                connector.requestSuggestions(payload, undefined, undefined, true)
            } else {
                // otherwise just update payload attributes in store with the transformed one
                mynahUI.updateStore({
                    query: payload.query,
                    code: payload.code,
                    codeQuery: payload.codeQuery,
                    matchPolicy: payload.matchPolicy,
                })
            }
        },
        onChangeLiveSearchState: connector.toggleLiveSearch,
        onChangeContext: connector.recordContextChange,
        onClickCodeDetails: connector.clickCodeDetails,
        onClickSuggestionVote: connector.updateVoteOfSuggestion,
        onRequestHistoryRecords: connector.requestHistoryRecords,
        onSendFeedback: connector.sendFeedback,
        onSuggestionClipboardInteraction: connector.triggerSuggestionClipboardInteraction,
        onSuggestionEngagement: connector.triggerSuggestionEngagement,
        onSuggestionInteraction: (eventName, suggestion) => {
            connector.triggerSuggestionEvent(eventName, suggestion, mynahUI.getSearchPayload().selectedTab)
        },
        onResetStore: connector.resetStore,
    })

    mynahUI.setStoreDefaults({
        invisibleContextItems: contextItemsUsedAsTabs,
        navigationTabs: getTabs(),
    })
}
