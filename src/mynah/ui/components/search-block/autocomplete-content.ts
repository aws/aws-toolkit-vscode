/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExtendedHTMLElement } from '../../helper/dom'
import { Overlay, OverlayHorizontalDirection, OverlayVerticalDirection } from '../overlay/overlay'
import { AutocompleteCardContent } from './autocomplete-card'

export interface AutocompleteItem {
    suggestion: string
    highlight: string
}

export interface AutocompleteContentProps {
    searchQuery: string
    referenceElement: Element | ExtendedHTMLElement
    autocompleteSuggestions: AutocompleteItem[]
    onAutocompleteClick: (autocompleteQuery: AutocompleteItem, index: number, count: number) => void
    onClose?: () => void
}

export class AutocompleteContent {
    private readonly autocompleteItemsOverlay
    public suggestions
    private searchQuery: string
    private currHover: number
    private readonly props: AutocompleteContentProps
    private isUsed: boolean
    render!: ExtendedHTMLElement
    constructor(props: AutocompleteContentProps) {
        this.props = props
        this.isUsed = false
        this.suggestions = props.autocompleteSuggestions
        this.searchQuery = props.searchQuery
        this.currHover = 0

        this.autocompleteItemsOverlay = new Overlay({
            dimOutside: false,
            referenceElement: props.referenceElement,
            verticalDirection: OverlayVerticalDirection.TO_BOTTOM,
            horizontalDirection: OverlayHorizontalDirection.START_TO_RIGHT,
            onClose: props.onClose,
            children: [
                {
                    type: 'div',
                    classNames: ['mynah-autocomplete-items-wrapper'],
                    children: this.autocompleteCards(this.props.autocompleteSuggestions, 0),
                },
            ],
        })
    }

    autocompleteCards = (autocompleteSuggestions: AutocompleteItem[], hovered: number): ExtendedHTMLElement[] =>
        autocompleteSuggestions.map(
            (record, index) =>
                new AutocompleteCardContent({
                    searchQuery: this.searchQuery,
                    content: record,
                    onAutocompleteClick: this.handleAutocompleteClick.bind(this),
                    isHovered: index + 1 === hovered,
                    index: index + 1,
                }).render
        )

    private readonly handleAutocompleteClick = (autocompleteItem: AutocompleteItem, index: number): void => {
        this.autocompleteItemsOverlay.close()
        this.props.onAutocompleteClick(autocompleteItem, index, this.getSuggestionsCount())
    }

    public updateSuggestions = (autocompleteSuggestions: AutocompleteItem[], hoverQuery: number): void => {
        this.suggestions = autocompleteSuggestions
        const cards = this.autocompleteCards(autocompleteSuggestions, hoverQuery)
        const cardWrapper = window.domBuilder.build({
            type: 'div',
            classNames: ['mynah-autocomplete-items-wrapper'],
            children: cards,
        })
        this.autocompleteItemsOverlay.updateContent([cardWrapper])
        cardWrapper.addClass('make-items-as-ghost')
        setTimeout(() => {
            cardWrapper.removeClass('make-items-as-ghost')
        }, 50)
    }

    public updateQuery = (searchQuery: string): void => {
        this.searchQuery = searchQuery
    }

    public hover = (isUp: boolean): string => {
        if (isUp) {
            this.currHover = this.currHover === 0 ? this.suggestions.length : this.currHover - 1
        } else {
            this.currHover = (this.currHover + 1) % (this.suggestions.length + 1)
        }

        this.updateSuggestions(this.suggestions, this.currHover)

        if (this.currHover === 0) {
            this.setIsUsed(false)
            return this.searchQuery
        } else {
            this.setIsUsed(true)
            return this.suggestions[this.currHover - 1].suggestion
        }
    }

    public setIsUsed = (val: boolean): void => {
        this.isUsed = val
    }

    public getIsUsed = (): boolean => {
        return this.isUsed
    }

    public getCurrentSelected = (): number => {
        return this.currHover
    }

    public getSuggestionsCount = (): number => {
        return this.suggestions.length
    }

    public close = (): void => {
        this.autocompleteItemsOverlay.close()
    }
}
