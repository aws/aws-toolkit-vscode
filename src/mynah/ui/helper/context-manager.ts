/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExtendedHTMLElement } from './dom'
import { MynahEventNames, MynahPortalNames, SearchPayloadMatchPolicy } from './static'

export interface ContextCheckboxProps {
    context: ContextType
}
export class ContextCheckbox {
    render: ExtendedHTMLElement[]
    constructor(props: ContextCheckboxProps) {
        this.render = [
            window.domBuilder.build({
                type: 'style',
                attributes: { type: 'text/css', 'style-of': props.context.context },
                innerHTML: `
              [id="${props.context.context}"]:hover~.mynah-main > .mynah-cards-wrapper > .mynah-card:not([data-filter*="${props.context.context},"]) {
                  opacity: 0.15;
              }`,
            }),
            window.domBuilder.build({
                type: 'input',
                classNames: [
                    'mynah-context-checkbox',
                    ContextTypeClassNames[props.context.type ?? ContextTypes.SHOULD],
                ],
                attributes: { type: 'checkbox', id: props.context.context },
            }),
        ]
    }
}

export enum ContextTypeClassNames {
    should = 'mynah-should-contain',
    must = 'mynah-must-contain',
    mustNot = 'mynah-must-not-contain',
}
export enum ContextTypes {
    MUST = 'must',
    SHOULD = 'should',
    MUST_NOT = 'mustNot',
}
export enum ContextSource {
    AUTO = 'auto',
    USER = 'user',
    SUGGESTION = 'suggestion',
}
export const ContextTypePriorityMap = Object.keys(ContextTypes)
export const EmptyContextObject = {
    context: '',
    visible: false,
    availableInSuggestion: false,
    type: ContextTypes.SHOULD,
    source: ContextSource.SUGGESTION,
}

export interface ContextType {
    context: string
    type?: ContextTypes
    availableInSuggestion?: boolean
    visible?: boolean
    source: ContextSource
}
export class ContextManager {
    contextMap: Record<string, ContextType> = {}
    private contextCheckboxes: Record<string, HTMLElement[]> = {}

    removeAll = (): void => {
        Object.keys(this.contextMap).forEach(contextKey => {
            delete this.contextMap[contextKey].visible
            if (this.contextCheckboxes[contextKey] !== undefined) {
                this.contextCheckboxes[contextKey].forEach(elm => elm.remove())
                // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                delete this.contextCheckboxes[contextKey]
            }
        })
        window.domBuilder.root.dispatchEvent(new CustomEvent(MynahEventNames.REMOVE_ALL_CONTEXT, {}))
    }

    clear = (): void => {
        Object.keys(this.contextMap).forEach(contextKey => {
            if (this.contextMap[contextKey].visible ?? false) {
                this.contextMap[contextKey].availableInSuggestion = false
            } else {
                // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                delete this.contextMap[contextKey]
                // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
                if (this.contextCheckboxes[contextKey]) {
                    this.contextCheckboxes[contextKey].forEach(elm => elm.remove())
                    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                    delete this.contextCheckboxes[contextKey]
                }
            }
        })
    }

    areContextItemsIdentical = (context: ContextType, contextToCompare: ContextType): boolean =>
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        context &&
        contextToCompare &&
        context.context === contextToCompare.context &&
        context.type === contextToCompare.type &&
        context.visible === contextToCompare.visible

    addOrUpdateContext = (context: ContextType, dispatchEvent: boolean = true): ContextType => {
        const contextKey = context.context
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        const currentContext = this.contextMap[contextKey] ? this.contextMap[contextKey] : EmptyContextObject
        const newContext = {
            ...currentContext,
            ...context,
        }
        if (!((newContext.visible ?? false) && !(currentContext.visible ?? false))) {
            // Source is only updated, if the new context is making the context visible.
            newContext.source = currentContext.source
        }
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if (!this.contextMap[contextKey] || !this.areContextItemsIdentical(this.contextMap[contextKey], newContext)) {
            this.contextMap[contextKey] = newContext
            // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
            if (this.contextCheckboxes[contextKey]) {
                this.contextCheckboxes[contextKey].forEach(elm => elm.remove())
                // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                delete this.contextCheckboxes[contextKey]
            }
            if (this.contextMap[contextKey].type === ContextTypes.SHOULD) {
                this.contextCheckboxes[contextKey] = new ContextCheckbox({
                    context: this.contextMap[contextKey],
                }).render
                window.domBuilder
                    .getPortal(MynahPortalNames.WRAPPER)
                    .insertChild('afterbegin', this.contextCheckboxes[contextKey])
            }

            if ((this.contextMap[contextKey].visible ?? false) && dispatchEvent) {
                window.domBuilder.root.dispatchEvent(
                    new CustomEvent(MynahEventNames.CONTEXT_VISIBILITY_CHANGE, { detail: { context: contextKey } })
                )
            }
        }
        return newContext
    }

    removeContext = (contextKey: string): void => {
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if (this.contextMap[contextKey]) {
            if (this.contextMap[contextKey].availableInSuggestion ?? false) {
                this.contextMap[contextKey].visible = false
                this.contextMap[contextKey].type = ContextTypes.SHOULD
            } else {
                delete this.contextMap[contextKey].visible
                // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
                if (this.contextCheckboxes[contextKey]) {
                    this.contextCheckboxes[contextKey].forEach(elm => elm.remove())
                    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                    delete this.contextCheckboxes[contextKey]
                }
            }
            window.domBuilder.root.dispatchEvent(
                new CustomEvent(MynahEventNames.CONTEXT_VISIBILITY_CHANGE, { detail: { context: contextKey } })
            )
        }
    }

    getContextObjectFromKey = (contextKey: string): ContextType => {
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if (this.contextMap[contextKey]) {
            return this.contextMap[contextKey]
        }
        return { ...EmptyContextObject, context: contextKey }
    }

    getContextMatchPolicy = (): SearchPayloadMatchPolicy => {
        return Object.keys(this.contextMap).reduce(
            (policySet: SearchPayloadMatchPolicy, currentKey: string) => {
                if ((this.contextMap[currentKey].visible ?? false) && currentKey.length > 0) {
                    policySet[this.contextMap[currentKey].type as ContextTypes].push(currentKey)
                }
                return policySet
            },
            {
                must: [],
                should: [],
                mustNot: [],
            }
        )
    }
}
