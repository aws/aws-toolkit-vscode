/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExtendedHTMLElement } from '../../helper/dom'
import { Icon, MynahIcons } from '../icon'

export interface SuggestionCardHeaderProps {
    title: string
    url: string
    onSuggestionTitleClick?: () => void
    onSuggestionLinkClick?: () => void
    onSuggestionLinkCopy?: () => void
}
export class SuggestionCardHeader {
    render: ExtendedHTMLElement
    constructor(props: SuggestionCardHeaderProps) {
        const splittedUrl = props.url
            .replace(/^(http|https):\/\//, '')
            .split('/')
            .slice(0, 3)
        this.render = window.domBuilder.build({
            type: 'div',
            classNames: ['mynah-card-header'],
            children: [
                {
                    type: 'div',
                    classNames: ['mynah-card-title-wrapper'],
                    events: {
                        ...(props.onSuggestionTitleClick !== undefined && {
                            click: (e: Event) => {
                                // to prevent double click from the anchor element inside, we need to check if it is not the anchor element
                                if (
                                    !(e.target as HTMLElement).classList.contains('mynah-card-url') &&
                                    props.onSuggestionTitleClick != undefined
                                ) {
                                    props.onSuggestionTitleClick()
                                }
                            },
                        }),
                    },
                    children: [
                        {
                            type: 'div',
                            classNames: ['mynah-card-title'],
                            children: [props.title],
                        },
                        {
                            type: 'a',
                            classNames: ['mynah-card-url'],
                            events: {
                                ...(props.onSuggestionLinkClick !== undefined && {
                                    click: props.onSuggestionLinkClick,
                                }),
                                ...(props.onSuggestionLinkCopy !== undefined && { copy: props.onSuggestionLinkCopy }),
                            },
                            attributes: { href: props.url, target: '_blank' },
                            innerHTML: `${splittedUrl.slice(0, splittedUrl.length - 1).join(' / ')} / <b>${
                                splittedUrl[splittedUrl.length - 1]
                            }</b>`,
                        },
                    ],
                },
                {
                    type: 'div',
                    classNames: ['mynah-card-expand-icon'],
                    children: [new Icon({ icon: MynahIcons.EXTERNAL }).render],
                },
            ],
        })
    }
}
