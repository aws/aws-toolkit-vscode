/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { MainContainer } from './components/main-container'
import { Notification, NotificationType } from './components/notification/notification'
import { SearchCard } from './components/search-block/search-card'
import { SuggestionEngagement } from './components/suggestion-card/suggestion-card'
import { MynahConfig } from './helper/config'
import { ContextChangeType, ServiceConnector, SuggestionEventName } from './helper/connector'
import { ContextManager } from './helper/context-manager'
import { DomBuilder, ExtendedHTMLElement } from './helper/dom'
import { MynahPortalNames, Suggestion, SearchPayload, MynahEventNames, LiveSearchState } from './helper/static'
import './styles/styles.scss'
import { I18n } from './translations/i18n'

export class MynahUI {
    private readonly wrapper: ExtendedHTMLElement
    private readonly searchCard: SearchCard
    private readonly mainContainer: MainContainer
    constructor() {
        window.ideApi = acquireVsCodeApi()
        window.domBuilder = new DomBuilder('body')
        window.contextManager = new ContextManager()
        window.serviceConnector = new ServiceConnector()
        window.config = new MynahConfig()
        window.i18n = new I18n(window.config.getConfig('language'))

        const isLiveSearchOn =
            window.config.getConfig('live') !== undefined &&
            window.config.getConfig('live') !== false &&
            window.config.getConfig('live') !== ''

        if (isLiveSearchOn) {
            window.serviceConnector.registerLiveSearchHandler(
                this.handleLiveSearch,
                this.handleLiveSearchExternalCommand
            )
        }

        this.wrapper = window.domBuilder.createPortal(
            MynahPortalNames.WRAPPER,
            {
                type: 'div',
                attributes: { id: 'mynah-wrapper' },
            },
            'afterbegin'
        )

        const codeQuery = (() => {
            try {
                return JSON.parse(window.config.getConfig('code-query'))
            } catch (err) {
                console.warn('Cannot parse code-query data from config.')
            }
        })()

        this.searchCard = new SearchCard({
            liveSearch: isLiveSearchOn,
            onLiveSearchToggle: (value: LiveSearchState) => {
                window.serviceConnector.toggleLiveSearch(value, this.handleLiveSearch)
            },
            onSearch: this.handleSearch,
            onHistoryChange: (suggestions: Suggestion[], payload: SearchPayload) => {
                if (suggestions !== undefined && suggestions.length > 0) {
                    this.wrapper.addClass('mynah-showing-suggestions-from-history')
                    this.mainContainer.updateCards(suggestions)

                    void window.serviceConnector.requestSuggestions(payload, true).then(() => {
                        // event sent
                    })
                } else {
                    this.wrapper.removeClass('mynah-showing-suggestions-from-history')
                    this.mainContainer.updateCards([])
                    const notification = new Notification({
                        title: "Can't show suggestions",
                        content: 'It seems like there was no suggestion on this search.',
                        type: NotificationType.WARNING,
                        onNotificationClick: () => {},
                    })
                    notification.notify()
                }
            },
            onCodeDetailsClicked: window.serviceConnector.clickCodeDetails,
            codeSelection: (() => {
                try {
                    return JSON.parse(window.config.getConfig('code-selection'))
                } catch (err) {
                    console.warn('Cannot parse code-selection data from config.')
                }
            })(),
            codeQuery,
            initText: window.config.getConfig('query-text'),
            initContextList: (() => {
                try {
                    return JSON.parse(window.config.getConfig('context'))
                } catch (err) {
                    console.warn('Cannot parse context from config.')
                }
            })(),
        })
        this.mainContainer = new MainContainer({
            onSuggestionOpen: (suggestion: Suggestion) => {
                window.serviceConnector.triggerSuggestionEvent(SuggestionEventName.CLICK, suggestion)
            },
            onSuggestionLinkClick: (suggestion: Suggestion) => {
                window.serviceConnector.triggerSuggestionEvent(SuggestionEventName.OPEN, suggestion)
            },
            onSuggestionLinkCopy: (suggestion: Suggestion) => {
                window.serviceConnector.triggerSuggestionEvent(SuggestionEventName.COPY, suggestion)
            },
            onSuggestionEngaged: (engagement: SuggestionEngagement) => {
                window.serviceConnector.triggerSuggestionEngagement(engagement)
            },
            onScroll: (e: Event) => this.searchCard.setFolded((e.target as HTMLElement).scrollTop > 0),
            onCopiedToClipboard: window.serviceConnector.triggerSuggestionClipboardInteraction,
        })

        this.wrapper
            .insertChild('beforeend', this.searchCard.render)
            .insertChild('beforeend', this.mainContainer.render)

        window.domBuilder.root.addEventListener(
            MynahEventNames.CONTEXT_VISIBILITY_CHANGE as keyof HTMLElementEventMap,
            this.recordContextChange.bind(this) as EventListener
        )

        if (
            (window.config.getConfig('query-text') !== undefined && window.config.getConfig('query-text') !== '') ||
            (codeQuery !== undefined && codeQuery.simpleNames.length !== 0)
        ) {
            const initSuggestions = window.config.getConfig('suggestions')
            if (initSuggestions !== undefined && initSuggestions !== '') {
                this.handleContentUpdate(JSON.parse(initSuggestions))
            } else {
                if (
                    window.config.getConfig('loading') !== undefined &&
                    window.config.getConfig('loading') !== '' &&
                    window.config.getConfig('loading') !== 'true'
                ) {
                    this.searchCard.setWaitState(true)
                    this.mainContainer.clearCards()
                }
                window.serviceConnector
                    .once()
                    .then(this.handleContentUpdate)
                    .catch((reason: Error) => {
                        console.warn(reason)
                        this.searchCard.setWaitState(false)
                        this.mainContainer.updateCards([])
                    })
            }
        }
        window.serviceConnector.uiReady()
        this.searchCard.addFocusOnInput()
    }

    private readonly handleLiveSearchExternalCommand = (state: LiveSearchState): void => {
        switch (state) {
            case LiveSearchState.PAUSE:
            case LiveSearchState.RESUME:
                this.searchCard.changeLiveSearchState(state)
                break
            case LiveSearchState.STOP:
                this.searchCard.removeLiveSearchToggle()
                break
        }
    }

    private readonly handleLiveSearch = (searchPayload?: SearchPayload, suggestions?: Suggestion[]): void => {
        this.searchCard.onLiveSearchDataReceived()
        if (suggestions !== undefined) {
            this.handleContentUpdate(suggestions)
        }

        this.searchCard.setSearchQuery('')
        window.contextManager.removeAll()

        if (searchPayload !== undefined) {
            this.searchCard.setSearchQuery(searchPayload.query)
            this.searchCard.setContextItems(searchPayload?.matchPolicy)
        }
    }

    private readonly handleContentUpdate = (suggestions: Suggestion[]): void => {
        window.contextManager.clear()
        this.mainContainer.updateCards(suggestions)
        window.config.setConfig('suggestions', JSON.stringify(suggestions))
        this.searchCard.setWaitState(false)
    }

    public handleSearch = (
        payload: SearchPayload,
        isFromAutocomplete: boolean,
        currAutocompleteSuggestionSelected?: number,
        autocompleteSuggestionsCount?: number
    ): void => {
        this.wrapper.removeClass('mynah-showing-suggestions-from-history')
        this.searchCard.setWaitState(true)
        this.mainContainer.clearCards()

        window.config.setConfig('query-text', payload.query)
        window.config.setConfig('context', JSON.stringify(payload.matchPolicy))
        window.config.setConfig('code-selection', JSON.stringify(payload.codeSelection))
        window.config.setConfig('code-query', JSON.stringify(payload.codeQuery))

        if (isFromAutocomplete) {
            window.serviceConnector.publishAutocompleteSuggestionSelectedEvent(
                payload.query,
                currAutocompleteSuggestionSelected,
                autocompleteSuggestionsCount
            )
        }

        window.serviceConnector
            .requestSuggestions(payload, false, isFromAutocomplete)
            .then((suggestions?: Suggestion[]) => {
                if (suggestions != undefined) {
                    this.handleContentUpdate(suggestions)
                }
            })
            .catch((err: Error) => {
                console.warn(err)
                this.searchCard.setWaitState(false)
                this.mainContainer.updateCards([])
            })
    }

    private readonly recordContextChange = (e: CustomEvent | { detail: { context: string } }): void => {
        const context = window.contextManager.getContextObjectFromKey(e.detail.context)
        if (context.visible !== undefined && context.visible) {
            window.serviceConnector.recordContextChange(ContextChangeType.ADD, context)
        } else {
            window.serviceConnector.recordContextChange(ContextChangeType.REMOVE, context)
        }
    }
}
