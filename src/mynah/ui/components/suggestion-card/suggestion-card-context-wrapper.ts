/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ContextSource } from '../../helper/context-manager'
import { ExtendedHTMLElement } from '../../helper/dom'
import { ContextPill } from '../context-item'

export interface SuggestionCardContextWrapperProps {
    contextList: string[]
}
export class SuggestionCardContextWrapper {
    render: ExtendedHTMLElement
    constructor(props: SuggestionCardContextWrapperProps) {
        this.render = window.domBuilder.build({
            type: 'div',
            classNames: ['mynah-card-context-wrapper'],
            children: [
                {
                    type: 'div',
                    classNames: ['mynah-card-tags'],
                    children: props.contextList.map((context: string) => {
                        window.contextManager.addOrUpdateContext({
                            ...window.contextManager.getContextObjectFromKey(context),
                            availableInSuggestion: true,
                            source: ContextSource.SUGGESTION,
                        })
                        return new ContextPill({
                            context: window.contextManager.contextMap[context],
                        }).render
                    }),
                },
            ],
        })
    }
}
