/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExtendedHTMLElement } from '../../helper/dom'
import {
    OnCopiedToClipboardFunction,
    Suggestion,
    SupportedCodingLanguagesExtensionToTypeMap,
} from '../../helper/static'
import { SuggestionCardRelevanceVote } from './suggestion-card-relevance-vote'
import { SyntaxHighlighter } from '../syntax-highlighter'
import { findLanguageFromSuggestion } from '../../helper/find-language'

export interface SuggestionCardBodyProps {
    suggestion: Suggestion
    onCopiedToClipboard?: OnCopiedToClipboardFunction
}
export class SuggestionCardBody {
    render: ExtendedHTMLElement

    constructor(props: SuggestionCardBodyProps) {
        const matchingLanguage =
            findLanguageFromSuggestion(props.suggestion) ?? SupportedCodingLanguagesExtensionToTypeMap.js
        this.render = window.domBuilder.build({
            type: 'div',
            classNames: ['mynah-card-center'],
            children: [
                {
                    type: 'div',
                    classNames: ['mynah-card-body'],
                    children: [
                        ...(Array.from(
                            window.domBuilder.build({
                                type: 'div',
                                innerHTML: props.suggestion.body,
                            }).childNodes
                        ).map(node => {
                            const elementFromNode: HTMLElement = node as HTMLElement
                            if (
                                elementFromNode.tagName?.toLowerCase() === 'pre' &&
                                // eslint-disable-next-line no-null/no-null
                                elementFromNode.querySelector('code') !== null
                            ) {
                                return new SyntaxHighlighter({
                                    codeStringWithMarkup: elementFromNode.querySelector('code')?.innerHTML ?? '',
                                    language: matchingLanguage,
                                    keepHighlights: true,
                                    showCopyOptions: true,
                                    onCopiedToClipboard: props.onCopiedToClipboard,
                                }).render
                            }
                            return node
                        }) as HTMLElement[]),
                    ],
                },
                new SuggestionCardRelevanceVote({ suggestion: props.suggestion }).render,
            ],
        })
    }
}
