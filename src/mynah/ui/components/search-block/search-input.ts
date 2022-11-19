/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { cancelEvent, ExtendedHTMLElement } from '../../helper/dom'
import { KeyMap } from '../../helper/static'
import { Button } from '../button'
import { Icon, MynahIcons } from '../icon'
import { HistoryContent, SearchHistoryItem } from './search-history-content'
import { Notification, NotificationType } from '../notification/notification'
import { AutocompleteContent, AutocompleteItem } from './autocomplete-content'

export interface SearchInputProps {
    onSearch: (
        queryText: string,
        isFromAutocomplete: boolean,
        currAutocompleteSuggestionSelected?: number,
        autocompleteSuggestionsCount?: number
    ) => void
    onHistoryChange: (historyItem: SearchHistoryItem) => void
    initText?: string
    searchAlwaysActive?: boolean
    hideHistoryButton?: boolean
}
export class SearchInput {
    props: SearchInputProps
    render: ExtendedHTMLElement
    private searchTextInput: ExtendedHTMLElement
    private readonly searchButton: ExtendedHTMLElement
    private readonly searchHistoryButton: ExtendedHTMLElement
    private readonly remainingIndicator: ExtendedHTMLElement
    private autocompleteContent: AutocompleteContent | undefined
    private readonly allowedCharCount: number = 1000
    constructor(props: SearchInputProps) {
        this.props = props

        const classNames = ['mynah-search-input']
        if (props.searchAlwaysActive ?? false) {
            classNames.push('search-always-active')
        }

        this.searchTextInput = window.domBuilder.build({
            type: 'input',
            classNames,
            attributes: {
                tabindex: '1',
                maxlength: '1000',
                type: 'text',
                placeholder:
                    props.searchAlwaysActive !== undefined && props.searchAlwaysActive
                        ? window.i18n.texts.searchInputAPIHelpPlaceholder
                        : window.i18n.texts.searchInputMynahPlaceholder,
                value: props.initText ?? '',
            },
            events: {
                keyup: this.handleInputKeydown.bind(this),
            },
        })
        this.searchButton = new Button({
            classNames: ['mynah-icon-button', 'mynah-search-button'],
            attributes: { tabindex: '5' },
            icon: window.domBuilder.build({
                type: 'div',
                classNames: ['mynah-mutating-next-icon'],
                children: [
                    new Icon({ icon: MynahIcons.SEARCH }).render,
                    { type: 'i', classNames: ['mynah-loading-spinner'] },
                ],
            }),
            onClick: this.triggerSearch.bind(this),
        }).render
        this.searchHistoryButton = new Button({
            classNames: ['mynah-icon-button'],
            primary: false,
            attributes: { tabindex: '5' },
            icon: window.domBuilder.build({
                type: 'div',
                classNames: ['mynah-search-history-icon'],
                children: [
                    new Icon({ icon: MynahIcons.SEARCH_HISTORY }).render,
                    { type: 'i', classNames: ['mynah-history-icon'] },
                ],
            }),
            onClick: this.triggerSearchHistory.bind(this),
        }).render

        this.remainingIndicator = window.domBuilder.build({
            type: 'span',
            attributes: {
                'remaining-chars': (props.initText !== undefined && props.initText.length > 0
                    ? this.allowedCharCount - props.initText.length
                    : this.allowedCharCount
                ).toString(),
                'max-chars': this.allowedCharCount.toString(),
            },
        })

        this.render = window.domBuilder.build({
            type: 'div',
            classNames: ['mynah-search-input-wrapper'],
            children: [
                {
                    type: 'img',
                    classNames: ['mynah-logo'],
                    attributes: { src: window.config.getConfig('logo-url') },
                },
                this.searchTextInput,
                this.remainingIndicator,
                ...(!(props.hideHistoryButton ?? false) ? [this.searchHistoryButton] : []),
                this.searchButton,
            ],
        })
    }

    public addFocusOnInput = (): void => {
        this.searchTextInput.focus()
    }

    private readonly handleInputKeydown = (e: KeyboardEvent): void => {
        if (e.key === KeyMap.ENTER) {
            cancelEvent(e)
            this.triggerSearch()
        } else if (e.key === KeyMap.ARROW_DOWN) {
            if (this.autocompleteContent !== undefined) {
                this.searchTextInput.value = this.autocompleteContent.hover(false)
            }
        } else if (e.key === KeyMap.ARROW_UP) {
            if (this.autocompleteContent !== undefined) {
                this.searchTextInput.value = this.autocompleteContent.hover(true)
            }
        } else if (
            e.key === KeyMap.DELETE ||
            e.key === KeyMap.BACKSPACE ||
            !Object.values<string>(KeyMap).includes(e.key)
        ) {
            this.getAutocompleteSuggestions(this.searchTextInput.value)
        }
        this.remainingIndicator.update({
            attributes: {
                'remaining-chars': (this.allowedCharCount - this.searchTextInput.value.length).toString(),
            },
        })
    }

    triggerSearch = (): void => {
        if (this.props.searchAlwaysActive !== undefined || this.searchTextInput.value.trim() !== '') {
            let isAutocompleteUsed = false
            let currAutocompleteSuggestionSelected
            let autocompleteSuggestionsCount
            if (this.autocompleteContent !== undefined) {
                isAutocompleteUsed = this.autocompleteContent.getIsUsed()
                currAutocompleteSuggestionSelected = this.autocompleteContent.getCurrentSelected()
                autocompleteSuggestionsCount = this.autocompleteContent.getSuggestionsCount()
                this.autocompleteContent?.close()
            }
            this.props.onSearch(
                this.searchTextInput.value,
                isAutocompleteUsed,
                currAutocompleteSuggestionSelected,
                autocompleteSuggestionsCount
            )
        }
    }

    triggerSearchHistory = (): void => {
        const filters = {
            isGlobal: false,
            languages: [],
            resultOffset: 0,
            resultLimit: 50,
        }
        this.searchHistoryButton.addClass('mynah-button-wait')
        window.serviceConnector
            .requestHistoryRecords(filters)
            .then((searchHistory: SearchHistoryItem[]) => {
                this.searchHistoryButton.removeClass('mynah-button-wait')
                const historyContent = new HistoryContent({
                    referenceElement: this.searchHistoryButton,
                    searchHistory,
                    onHistoryChange: this.handleHistoryChange,
                })
                historyContent.createOverlay()
            })
            .catch((err: Error) => {
                console.warn(err)
                this.searchHistoryButton.removeClass('mynah-button-wait')
                const notification = new Notification({
                    content: "Couldn't retrieve history items",
                    type: NotificationType.WARNING,
                })

                notification.notify()
            })
    }

    getAutocompleteSuggestions = (input: string): void => {
        if (input.trim() === '') {
            this.autocompleteContent?.close()
        } else {
            window.serviceConnector
                .requestAutocomplete(input)
                .then((autocompleteSuggestions: AutocompleteItem[]) => {
                    if (this.autocompleteContent !== undefined) {
                        if (autocompleteSuggestions.length === 0) {
                            this.autocompleteContent?.close()
                        } else {
                            this.autocompleteContent.updateQuery(input)
                            this.autocompleteContent.updateSuggestions(autocompleteSuggestions, 0)
                        }
                    } else {
                        this.autocompleteContent = new AutocompleteContent({
                            searchQuery: input,
                            referenceElement: this.searchTextInput,
                            autocompleteSuggestions,
                            onAutocompleteClick: this.handleAutocompleteClick,
                            onClose: () => {
                                this.autocompleteContent = undefined
                            },
                        })
                    }
                })
                .catch((err: Error) => {
                    console.warn(err)
                })
        }
    }

    private readonly handleHistoryChange = (historyItem: SearchHistoryItem): void => {
        this.searchTextInput.value = historyItem.query.input
        this.remainingIndicator.update({
            attributes: {
                'remaining-chars': (this.allowedCharCount - this.searchTextInput.value.length).toString(),
            },
        })
        this.props.onHistoryChange(historyItem)
    }

    private readonly handleAutocompleteClick = (
        autocompleteQuery: AutocompleteItem,
        index: number,
        count: number
    ): void => {
        this.searchTextInput.value = autocompleteQuery.suggestion
        this.remainingIndicator.update({
            attributes: {
                'remaining-chars': (this.allowedCharCount - this.searchTextInput.value.length).toString(),
            },
        })
        this.props.onSearch(autocompleteQuery.suggestion, true, index, count)
    }

    getSearchText = (): string => this.searchTextInput.value

    setSearchText = (value: string): void => {
        this.searchTextInput.value = value
        this.remainingIndicator.update({
            attributes: {
                'remaining-chars': (this.allowedCharCount - this.searchTextInput.value.length).toString(),
            },
        })
    }

    public setWaitState = (waitState?: boolean): void => {
        if (waitState ?? false) {
            this.searchButton.addClass('mynah-button-wait')
        } else {
            this.searchButton.removeClass('mynah-button-wait')
        }
    }
}
