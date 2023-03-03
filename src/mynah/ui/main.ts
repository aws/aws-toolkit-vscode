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
    validateRulesOnPayloadData,
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

const contextItemsUsedAsTabs = ['code', 'q&a', 'docs']
const baseRules: Record<string, PayloadTransformRule> = {
    removeAllFromMust: { targetRoute: ['matchPolicy', 'must'], method: 'remove', values: contextItemsUsedAsTabs },
    removeAllFromMustNot: { targetRoute: ['matchPolicy', 'mustNot'], method: 'remove', values: contextItemsUsedAsTabs },
    addAllToMustNot: { targetRoute: ['matchPolicy', 'mustNot'], method: 'add', values: contextItemsUsedAsTabs },
}

// @ts-ignore
export const createMynahUI = (initialData?: MynahUIDataModel) => {
    const defaultNavigationTabs = [
        NavigationTabs.top,
        NavigationTabs.docs,
        NavigationTabs.apiDocs,
        NavigationTabs.blog,
        NavigationTabs.code,
        NavigationTabs.qA,
    ]

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
            selectedNavigationTab: NavigationTabs.top.value,
            navigationTabs: [
                NavigationTabs.top,
                NavigationTabs.docs,
                {
                    ...NavigationTabs.apiDocs,
                    disabled: (initialData?.codeQuery?.usedFullyQualifiedNames ?? []).length === 0,
                },
                NavigationTabs.blog,
                NavigationTabs.code,
                NavigationTabs.qA,
            ],
        },
        onReady: connector.uiReady,
        onSearch: (payload: SearchPayload, isFromHistory, isFromAutocomplete) => {
            connector.requestSuggestions(payload, isFromHistory, isFromAutocomplete)

            if (isFromHistory) {
                // If the search is a historical one, try to find a matching tab with the validation of the rules
                const potentiallySelectedTab = defaultNavigationTabs.reduce(
                    (res: string | undefined, navTab: ToggleOption) => {
                        if (validateRulesOnPayloadData(navigationTabRules[navTab.value], payload)) {
                            return navTab.value
                        }
                        return res
                    },
                    undefined
                )

                mynahUI.updateStore({
                    liveSearchState: LiveSearchState.STOP,
                    // If there is an item we can count it as the selected tab, if not switch to default
                    selectedNavigationTab: potentiallySelectedTab ?? NavigationTabs.top.value,
                })
            } else {
                mynahUI.updateStore({ loading: true })
            }
        },
        onNavigationTabChange: (selectedTab: string) => {
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
                connector.requestSuggestions(payload)
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
        onSuggestionInteraction: connector.triggerSuggestionEvent,
        onResetStore: connector.resetStore,
    })

    mynahUI.setStoreDefaults({
        invisibleContextItems: contextItemsUsedAsTabs,
        selectedNavigationTab: NavigationTabs.top.value,
        navigationTabs: defaultNavigationTabs,
    })
}
