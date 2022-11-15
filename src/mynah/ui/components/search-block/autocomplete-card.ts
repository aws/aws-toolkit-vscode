/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { cancelEvent, ExtendedHTMLElement } from '../../helper/dom'
import { Button } from '../button'
import { AutocompleteItem } from './autocomplete-content'

export interface AutocompleteCardContentProps {
    searchQuery: string
    content: AutocompleteItem
    onAutocompleteClick: (autocompleteQuery: AutocompleteItem, index: number) => void
    index: number
    isHovered: boolean | false
}
export class AutocompleteCardContent {
    render: ExtendedHTMLElement
    openSearch: any
    searchQuery: string

    constructor(props: AutocompleteCardContentProps) {
        this.searchQuery = props.searchQuery
        const buttonClassNames = ['mynah-autocomplete-button']
        if (props.isHovered) {
            buttonClassNames.push('hover')
        }
        this.render = new Button({
            classNames: buttonClassNames,
            onClick: (e: Event) => {
                cancelEvent(e)
                props.onAutocompleteClick(props.content, props.index)
            },
            label: window.domBuilder.build({
                type: 'div',
                classNames: ['mynah-autocomplete-button-label'],
                children: [
                    {
                        type: 'div',
                        classNames: ['mynah-autocomplete-title-wrapper'],
                        children: [
                            {
                                classNames: ['autocomplete'],
                                type: 'h3',
                                innerHTML: this.formatSuggestion(props.content.suggestion),
                            },
                        ],
                    },
                ],
            }),
        }).render
    }

    private formatSuggestion(suggestion: string): string {
        const boldWords = this.searchQuery.split(' ').filter(word => word.trim().length > 0)

        boldWords.forEach(word => {
            suggestion = suggestion.replace(new RegExp('(' + word + ')', 'i'), makeBold('$1'))
        })

        function makeBold(word: string): string {
            return word.bold()
        }
        return suggestion
    }
}
