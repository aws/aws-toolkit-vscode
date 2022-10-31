/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { cancelEvent, ExtendedHTMLElement } from '../../helper/dom'
import { Icon, MynahIcons } from '../icon'
import { SyntaxHighlighter } from '../syntax-highlighter'
import { getLanguageFromFileName } from '../../helper/find-language'
import { SupportedCodingLanguagesExtensionToTypeMap } from '../../helper/static'

export interface SearchApiHelpProps {
    code: string
    fileName?: string
    range?: {
        start: { row: string; column?: string }
        end?: { row: string; column?: string }
    }
}
export class SearchApiHelp {
    props!: SearchApiHelpProps
    render: ExtendedHTMLElement
    private isCollapsed: boolean = true
    private readonly onCodeDetailsClicked?: (
        code: string,
        fileName?: string,
        range?: {
            start: { row: string; column?: string }
            end?: { row: string; column?: string }
        }
    ) => void

    constructor(
        onCodeDetailsClicked?: (
            code: string,
            fileName?: string,
            range?: {
                start: { row: string; column?: string }
                end?: { row: string; column?: string }
            }
        ) => void
    ) {
        if (onCodeDetailsClicked !== undefined) {
            this.onCodeDetailsClicked = onCodeDetailsClicked
        }
        this.render = window.domBuilder.build({
            type: 'div',
            classNames: ['mynah-search-api-help', 'hide', 'collapsed'],
            children: [],
        })
    }

    public hide = (): void => {
        this.render.addClass('hide')
    }

    public show = (): void => {
        this.render.removeClass('hide')
    }

    public updateContent = (props: SearchApiHelpProps): void => {
        this.props = props
        this.render.update({
            children: [
                window.domBuilder.build({
                    type: 'div',
                    classNames: ['mynah-search-api-help-code-view-detail-row'],
                    children: [
                        {
                            type: 'h4',
                            innerHTML: 'Target file:',
                        },
                        {
                            type: 'b',
                            innerHTML: props.fileName,
                        },
                    ],
                }),
                window.domBuilder.build({
                    type: 'div',
                    classNames: ['mynah-search-api-help-code-view-detail-row'],
                    children: [
                        {
                            type: 'h4',
                            innerHTML: 'Selected range:',
                        },
                        {
                            type: 'span',
                            innerHTML:
                                props.range !== undefined
                                    ? `${props.range.end !== undefined ? 'From ' : ''}line <b>${
                                          props.range.start.row
                                      }</b>, column <b>${props.range.start.column ?? ''}</b> ${
                                          props.range.end !== undefined
                                              ? `to line <b>${props.range.end?.row}</b>, column <b>${
                                                    props.range.end?.column ?? ''
                                                }</b>`
                                              : ''
                                      }`
                                    : '',
                        },
                    ],
                }),
                window.domBuilder.build({
                    type: 'div',
                    classNames: ['mynah-search-api-help-code-view-wrapper'],
                    events: {
                        click: e => {
                            cancelEvent(e)
                            // uncollapse only if it is collapsed, not collapse it back with code click to make it selectable
                            if (this.isCollapsed) {
                                this.isCollapsed = false
                                if (this.onCodeDetailsClicked !== undefined) {
                                    this.onCodeDetailsClicked(this.props.code, this.props.fileName, this.props.range)
                                }
                                this.render.removeClass('collapsed')
                            }
                        },
                    },
                    children: [
                        new SyntaxHighlighter({
                            codeStringWithMarkup: props.code,
                            language:
                                props.fileName !== undefined
                                    ? getLanguageFromFileName(props.fileName)
                                    : SupportedCodingLanguagesExtensionToTypeMap.js,
                            keepHighlights: false,
                            showLineNumbers: true,
                            startingLineNumber: Number(props.range?.start.row ?? 1),
                        }).render,
                    ],
                }),
                window.domBuilder.build({
                    type: 'div',
                    classNames: ['mynah-search-api-help-collapser'],
                    events: {
                        click: e => {
                            cancelEvent(e)
                            this.isCollapsed = !this.isCollapsed
                            if (this.onCodeDetailsClicked !== undefined) {
                                this.onCodeDetailsClicked(this.props.code, this.props.fileName, this.props.range)
                            }
                            this.render.toggleClass('collapsed')
                        },
                    },
                    children: [
                        {
                            type: 'span',
                            classNames: ['mynah-search-api-help-uncollapse-icon'],
                            children: [new Icon({ icon: MynahIcons.DOWN_OPEN }).render],
                        },
                        {
                            type: 'span',
                            classNames: ['mynah-search-api-help-collapse-icon'],
                            children: [new Icon({ icon: MynahIcons.UP_OPEN }).render],
                        },
                    ],
                }),
            ],
        })
    }
}
