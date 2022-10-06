/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-dynamic-delete */
/* eslint-disable @typescript-eslint/prefer-optional-chain */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import { ContextSource, ContextType, ContextTypes } from '../../helper/context-manager'
import { cancelEvent, ExtendedHTMLElement } from '../../helper/dom'
import { KeyMap, MynahEventNames, SearchPayloadMatchPolicy } from '../../helper/static'
import { ContextPill } from '../context-item'
import { Icon, MynahIcons } from '../icon'
import { Notification, NotificationType } from '../notification/notification'

interface RenderedContextType extends ContextType {
    render: HTMLElement | ExtendedHTMLElement
}
export interface SearchContextProps {
    initContextList?: SearchPayloadMatchPolicy
    onContextInsertionEnabled?: () => void
    onContextInsertionDisabled?: () => void
}

export class SearchContext {
    private readonly allowedCharCount = 100
    private readonly contextCheckExpression = /^\S+$/
    private readonly isAcceptedKeyPress = (char: string): boolean => this.contextCheckExpression.test(char)
    private readonly acceptedNagivationKeys = Object.keys(KeyMap).map(
        (key: string) => (KeyMap as Record<string, string>)[key]
    )

    private renderedContextMap: Record<string, RenderedContextType> = {}
    private readonly onContextInsertionEnabled
    private readonly onContextInsertionDisabled

    constructor(props?: SearchContextProps) {
        this.onContextInsertionEnabled = props?.onContextInsertionEnabled
        this.onContextInsertionDisabled = props?.onContextInsertionDisabled
        if (props?.initContextList !== undefined) {
            this.updateLocalContext(props.initContextList)
        }

        window.domBuilder.root.addEventListener(
            MynahEventNames.CONTEXT_VISIBILITY_CHANGE as keyof HTMLElementEventMap,
            this.updateContextItems.bind(this) as EventListener
        )

        window.domBuilder.root.addEventListener(MynahEventNames.REMOVE_ALL_CONTEXT as keyof HTMLElementEventMap, () => {
            Object.keys(this.renderedContextMap).forEach(contextKey => {
                this.renderedContextMap[contextKey].render.remove()
            })
            this.renderedContextMap = {}
        })
    }

    updateLocalContext = (contextItems: SearchPayloadMatchPolicy): void => {
        Object.keys(contextItems).forEach((policyGroup: string) => {
            contextItems[policyGroup as keyof SearchPayloadMatchPolicy].forEach((contextKey: string) => {
                window.contextManager.addOrUpdateContext(
                    {
                        context: contextKey,
                        type: policyGroup as ContextTypes,
                        visible: true,
                        source: ContextSource.AUTO,
                    },
                    false
                )
                this.updateContextItems({ detail: { context: contextKey } })
            })
        })
    }

    private readonly updateContextItems = (e: CustomEvent | { detail: { context: string } }): void => {
        const contextKey = e.detail.context
        if (
            this.renderedContextMap[contextKey] &&
            (!window.contextManager.contextMap[contextKey] ||
                !window.contextManager.contextMap[contextKey].visible ||
                !window.contextManager.areContextItemsIdentical(
                    window.contextManager.contextMap[contextKey],
                    this.renderedContextMap[contextKey]
                ))
        ) {
            this.renderedContextMap[contextKey].render.remove()
            delete this.renderedContextMap[contextKey]
        }

        if (
            window.contextManager.contextMap[contextKey]?.visible &&
            !window.contextManager.areContextItemsIdentical(
                window.contextManager.contextMap[contextKey],
                this.renderedContextMap[contextKey]
            )
        ) {
            const contextRender = new ContextPill({
                context: window.contextManager.contextMap[contextKey],
                showRemoveButton: true,
            }).render
            this.renderedContextMap[contextKey] = {
                ...window.contextManager.contextMap[contextKey],
                render: contextRender,
            }
            this.contextWrapper.insertChild('afterbegin', contextRender)
        }
    }

    private readonly enableContextInsertion = (): void => {
        this.contextInsertionButton.addClass('context-insertion-activated')
        this.contextInsertionInput.focus()
        if (this.onContextInsertionEnabled !== undefined) {
            this.onContextInsertionEnabled()
        }
    }

    private readonly disableContextInsertion = (): void => {
        this.contextInsertionButton.removeClass('context-insertion-activated')
        this.contextInsertionInput.value = ''
        this.inputAutoWidth.update({
            innerHTML: '',
        })
        if (this.onContextInsertionDisabled !== undefined) {
            this.onContextInsertionDisabled()
        }
    }

    private readonly contextInsertionKeydownHandler = (e: KeyboardEvent): void => {
        if (this.acceptedNagivationKeys.includes(e.key) || this.isAcceptedKeyPress(e.key)) {
            if (e.key === KeyMap.ENTER) {
                cancelEvent(e)
                if (this.contextCheckExpression.test(this.contextInsertionInput.value)) {
                    if (!this.renderedContextMap[this.contextInsertionInput.value]) {
                        window.contextManager.addOrUpdateContext({
                            context: this.contextInsertionInput.value,
                            visible: true,
                            source: ContextSource.USER,
                        })
                    } else {
                        this.contextWrapper.insertChild(
                            'afterbegin',
                            this.renderedContextMap[this.contextInsertionInput.value].render
                        )
                    }

                    this.inputAutoWidth.update({
                        innerHTML: '',
                    })
                    this.contextInsertionInput.value = ''
                } else {
                    this.contextInsertionButton.removeClass('shake')
                    setTimeout(() => {
                        this.contextInsertionButton.addClass('shake')
                        const notification = new Notification({
                            content: 'You cannot add context items containing spaces.',
                            type: NotificationType.ERROR,
                            onNotificationClick: () => {},
                        })
                        notification.notify()
                    }, 50)
                }
            } else if (e.key === KeyMap.ESCAPE) {
                cancelEvent(e)
                this.disableContextInsertion()
            } else {
                if (
                    !this.acceptedNagivationKeys.includes(e.key) &&
                    this.allowedCharCount - this.contextInsertionInput.value.length <= 0
                ) {
                    cancelEvent(e)
                }
            }
        } else {
            cancelEvent(e)
        }
    }

    private readonly inputAutoWidth = window.domBuilder.build({
        type: 'span',
    })

    private contextInsertionInput = window.domBuilder.build({
        type: 'input',
        classNames: ['context-text-input'],
        attributes: {
            maxlength: this.allowedCharCount.toString(),
            tabindex: '10',
            type: 'text',
            placeholder: 'Add context',
        },
        events: {
            focus: this.enableContextInsertion.bind(this),
            blur: this.disableContextInsertion.bind(this),
            keydown: this.contextInsertionKeydownHandler.bind(this),
            input: () => {
                this.inputAutoWidth.update({
                    innerHTML: this.contextInsertionInput.value,
                })
            },
            paste: cancelEvent,
        },
    })

    private readonly contextInsertionButton = window.domBuilder.build({
        type: 'label',
        persistent: true,
        classNames: ['mynah-context-checkbox-label'],
        attributes: { id: 'add-new-context' },
        events: { click: this.enableContextInsertion.bind(this) },
        children: [
            new Icon({ icon: MynahIcons.PLUS }).render,
            {
                type: 'span',
                classNames: ['add-new-context-label'],
                children: ['Add context'],
            },
            this.contextInsertionInput,
            this.inputAutoWidth,
        ],
    })

    private readonly contextWrapper = window.domBuilder.build({
        type: 'div',
        classNames: ['mynah-context-wrapper'],
        children: [this.contextInsertionButton],
    })

    render = window.domBuilder.build({
        type: 'div',
        classNames: ['mynah-search-block-advanced-control'],
        children: [this.contextWrapper],
    })
}
