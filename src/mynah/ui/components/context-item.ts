/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ContextType, ContextTypeClassNames, ContextTypes } from '../helper/context-manager'
import { cancelEvent, ExtendedHTMLElement } from '../helper/dom'
import { Button } from './button'
import { Icon, MynahIcons } from './icon'
import { PrioritizationMenuButtons } from './prioritization-menu'

export interface ContextPillProps {
    context: ContextType
    showRemoveButton?: boolean
}
export class ContextPill {
    private readonly props: ContextPillProps
    render: ExtendedHTMLElement
    constructor(props: ContextPillProps) {
        this.props = props

        this.render = window.domBuilder.build({
            type: 'span',
            attributes: { 'pill-of': props.context.context },
            classNames: ['mynah-context-pill', ContextTypeClassNames[props.context.type ?? ContextTypes.SHOULD]],
            children: [
                {
                    type: 'label',
                    attributes: { for: props.context.context },
                    classNames: ['mynah-context-checkbox-label'],
                    events: !(props.showRemoveButton ?? false)
                        ? {
                              click: (event: Event) => {
                                  cancelEvent(event)
                                  window.contextManager.addOrUpdateContext({ ...props.context, visible: true })
                              },
                          }
                        : {},
                    children: [
                        ...((props.showRemoveButton ?? false) && props.context.type !== ContextTypes.SHOULD
                            ? [
                                  new Icon({
                                      icon:
                                          props.context.type === ContextTypes.MUST
                                              ? MynahIcons.OK_CIRCLED
                                              : MynahIcons.BLOCK,
                                  }).render,
                              ]
                            : []),
                        { type: 'span', innerHTML: props.context.context },
                        ...(props.showRemoveButton ?? false
                            ? [
                                  {
                                      type: 'div',
                                      classNames: ['filter-remove-button'],
                                      events: {
                                          click: (event: Event) => {
                                              cancelEvent(event)
                                              window.contextManager.removeContext(props.context.context)
                                          },
                                      },
                                      children: [new Icon({ icon: MynahIcons.CANCEL }).render],
                                  },
                              ]
                            : []),
                    ],
                },
                new Button({
                    onClick: this.handleMenuOpen.bind(this),
                    icon: new Icon({ icon: MynahIcons.MENU }).render,
                }).render.addClass('mynah-prioritise-button'),
            ],
        })
    }

    private readonly handleMenuOpen = (e: Event): void => {
        const elm: HTMLElement = e.currentTarget as HTMLElement
        this.render.addClass('keep-active')
        const buttons = new PrioritizationMenuButtons({
            referenceElement: elm,
            context: this.props.context,
            onMenuClose: () => {
                this.render.removeClass('keep-active')
            },
        })
        buttons.createOverlay()
    }
}
