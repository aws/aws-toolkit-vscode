/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExtendedHTMLElement } from '../../helper/dom'
import {
    LiveSearchState,
    MynahEventNames,
    SearchPayload,
    SearchPayloadMatchPolicy,
    Suggestion,
} from '../../helper/static'
import { Button } from '../button'
import { Icon, MynahIcons } from '../icon'
import { SearchContext } from './search-context'
import { SearchInput } from './search-input'
import { ContextSource, ContextTypes } from '../../helper/context-manager'
import { SearchHistoryItem } from './search-history-content'
import { SearchApiHelp } from './search-api-help'
import { SearchLiveToggle } from './search-live-toggle'

export interface SearchCardProps {
    onSearch: (
        searchPayload: SearchPayload,
        isFromAutocomplete: boolean,
        currAutocompleteSuggestionSelected?: number,
        autocompleteSuggestionsCount?: number
    ) => void
    onHistoryChange?: (historySuggestions: Suggestion[], searchPayload: SearchPayload) => void
    onLiveSearchToggle?: (value: LiveSearchState) => void
    onCodeDetailsClicked?: (
        code: string,
        fileName?: string,
        range?: {
            start: { row: string; column?: string }
            end?: { row: string; column?: string }
        }
    ) => void
    initContextList?: SearchPayloadMatchPolicy
    initText?: string
    liveSearch?: boolean
    codeSelection?: {
        selectedCode: string
        file?: {
            range: {
                start: { row: string; column: string }
                end: { row: string; column: string }
            }
            name: string
        }
    }
    codeQuery?: {
        simpleNames: string[]
        usedFullyQualifiedNames: string[]
    }
}
export class SearchCard {
    props: SearchCardProps
    private historyProcess!: boolean
    private readonly searchInput: SearchInput
    private readonly searchAPIHelp: SearchApiHelp
    private liveSearchToggle: SearchLiveToggle | undefined = undefined
    private searchPayload: SearchPayload
    private readonly foldUnfoldButton: Button
    private readonly contextManagement: SearchContext
    private unfoldedByContextInsertion: boolean = false
    private unfoldedByButton: boolean = false
    render: ExtendedHTMLElement
    constructor(props: SearchCardProps) {
        this.props = props
        this.foldUnfoldButton = new Button({
            children: [new Icon({ icon: MynahIcons.DOWN_OPEN }).render, new Icon({ icon: MynahIcons.UP_OPEN }).render],
            onClick: () => {
                if (this.render.hasClass('mynah-search-block-unfold')) {
                    this.unfoldedByButton = false
                    if (!this.unfoldedByContextInsertion) {
                        this.render.removeClass('mynah-search-block-unfold')
                    }
                } else {
                    this.unfoldedByButton = true
                    this.render.addClass('mynah-search-block-unfold')
                }
            },
            classNames: ['mnynah-search-block-fold-unfold-button'],
        })

        window.domBuilder.root.addEventListener(MynahEventNames.CONTEXT_VISIBILITY_CHANGE, () => {
            this.handleContextChange(window.contextManager.getContextMatchPolicy())
        })

        this.searchPayload = {
            query: props.initText ?? '',
            matchPolicy: props.initContextList ?? {
                must: [],
                should: [],
                mustNot: [],
            },
            codeSelection: props.codeSelection ?? {
                selectedCode: '',
                file: {
                    range: {
                        start: { row: '', column: '' },
                        end: { row: '', column: '' },
                    },
                    name: '',
                },
            },
            codeQuery: props.codeQuery ?? {
                simpleNames: [],
                usedFullyQualifiedNames: [],
            },
        }
        this.contextManagement = new SearchContext({
            initContextList: props.initContextList,
            onContextInsertionEnabled: () => {
                this.unfoldedByContextInsertion = true
                this.render.addClass('mynah-search-block-unfold')
            },
            onContextInsertionDisabled: () => {
                this.unfoldedByContextInsertion = false
                if (!this.unfoldedByButton) {
                    this.render.removeClass('mynah-search-block-unfold')
                }
            },
        })
        this.searchInput = new SearchInput({
            onSearch: this.handleSearchQueryChange.bind(this),
            onHistoryChange: this.handleHistoryChange,
            initText: props.initText,
            hideHistoryButton: false,
            searchAlwaysActive: props.codeSelection !== undefined && props.codeSelection.selectedCode !== '',
        })

        this.searchAPIHelp = new SearchApiHelp(props.onCodeDetailsClicked)
        if (props.codeSelection !== undefined && props.codeSelection.selectedCode !== '') {
            this.searchAPIHelp.updateContent({
                code: props.codeSelection.selectedCode,
                fileName: props.codeSelection.file?.name,
                range: props.codeSelection.file?.range,
            })
            this.searchAPIHelp.show()
        }

        if (props.liveSearch ?? false) {
            this.liveSearchToggle = new SearchLiveToggle({
                label: 'Live suggestions:',
                value: LiveSearchState.RESUME,
                onChange: props.onLiveSearchToggle,
            })
        }

        this.render = window.domBuilder.build({
            type: 'div',
            persistent: true,
            classNames: ['mynah-search-block'],
            children: [
                ...((props.liveSearch ?? false) && this.liveSearchToggle !== undefined
                    ? [this.liveSearchToggle.render]
                    : []),
                this.searchAPIHelp.render,
                this.searchInput.render,
                this.contextManagement.render,
                this.foldUnfoldButton.render,
            ],
        })
    }

    public addFocusOnInput = (): void => {
        this.searchInput.addFocusOnInput()
    }

    private readonly performSearch = (
        isFromAutocomplete: boolean,
        currAutocompleteSuggestionSelected?: number,
        autocompleteSuggestionsCount?: number
    ): void => {
        this.props.onSearch(
            this.searchPayload,
            isFromAutocomplete,
            currAutocompleteSuggestionSelected,
            autocompleteSuggestionsCount
        )
        this.removeLiveSearchToggle()
    }

    private readonly handleSearchQueryChange = (
        searchQuery: string,
        isFromAutocomplete: boolean,
        currAutocompleteSuggestionSelected?: number,
        autocompleteSuggestionsCount?: number
    ): void => {
        this.searchPayload.query = searchQuery
        this.performSearch(isFromAutocomplete, currAutocompleteSuggestionSelected, autocompleteSuggestionsCount)
    }

    private readonly handleContextChange = (matchPolicy: SearchPayloadMatchPolicy): void => {
        this.searchPayload.matchPolicy = matchPolicy
        this.searchPayload.query = this.searchInput.getSearchText()
        if (
            !this.historyProcess &&
            (this.searchPayload.query.trim() !== '' ||
                (this.props.codeSelection !== undefined && this.props.codeSelection.selectedCode !== ''))
        ) {
            this.performSearch(false)
        }
    }

    private readonly handleHistoryChange = (historyItem: SearchHistoryItem): void => {
        if (this.props.onHistoryChange !== undefined) {
            this.removeLiveSearchToggle()
            this.historyProcess = true
            window.contextManager.removeAll()
            const contextItems = historyItem.query.queryContext
            Object.keys(contextItems).forEach((policyGroup: string) => {
                contextItems[policyGroup as keyof SearchPayloadMatchPolicy].forEach((contextKey: string) => {
                    window.contextManager.addOrUpdateContext({
                        context: contextKey,
                        type: policyGroup as ContextTypes,
                        visible: true,
                        source: ContextSource.AUTO,
                    })
                })
            })

            if (historyItem.query.codeSelection !== undefined && historyItem.query.codeSelection.selectedCode !== '') {
                this.searchAPIHelp.updateContent({
                    code: historyItem.query.codeSelection.selectedCode,
                    fileName: historyItem.query.codeSelection.file?.name,
                    range: historyItem.query.codeSelection.file?.range,
                })
                this.searchAPIHelp.show()
            } else {
                this.searchAPIHelp.hide()
            }

            this.props.onHistoryChange(historyItem.suggestions, {
                query: historyItem.query.input,
                matchPolicy: historyItem.query.queryContext,
                codeSelection: historyItem.query.codeSelection,
                codeQuery: historyItem.query.codeQuery,
            })
            this.historyProcess = false
        }
    }

    setSearchQuery = (value: string): void => {
        this.searchInput.setSearchText(value)
    }

    setContextItems = (contextItems: SearchPayloadMatchPolicy): void => {
        this.contextManagement.updateLocalContext(contextItems)
    }

    setWaitState = (waitState: boolean): void => {
        this.searchInput.setWaitState(waitState)
    }

    setFolded = (folded: boolean): void => {
        if (folded) {
            this.render.addClass('mynah-search-block-ready-to-fold')
        } else {
            this.render.removeClass('mynah-search-block-ready-to-fold')
        }
    }

    removeLiveSearchToggle = (): void => {
        if (this.props.liveSearch ?? false) {
            if (this.props.onLiveSearchToggle !== undefined) {
                this.props.onLiveSearchToggle(LiveSearchState.STOP)
            }
            this.liveSearchToggle?.render.remove()
            this.liveSearchToggle = undefined
        }
    }

    onLiveSearchDataReceived = (): void => {
        this.liveSearchToggle?.flashToggle()
    }

    changeLiveSearchState = (state: LiveSearchState): void => {
        this.liveSearchToggle?.setToggleState(state)
    }
}
