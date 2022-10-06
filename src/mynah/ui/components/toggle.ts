/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/restrict-template-expressions */
import { ExtendedHTMLElement } from '../helper/dom'

export interface ToggleOption {
    label?: ExtendedHTMLElement | string | HTMLElement
    color?: string
    value: string
}
export interface ToggleProps {
    options: ToggleOption[]
    value?: string
    name: string
    disabled?: boolean
    onChange?: (selectedValue: string) => void
}
export class Toggle {
    render: ExtendedHTMLElement
    private readonly props: ToggleProps
    private readonly relocateTransitioner: ExtendedHTMLElement

    constructor(props: ToggleProps) {
        this.props = props
        this.relocateTransitioner = window.domBuilder.build({
            type: 'span',
            classNames: ['mynah-toggle-indicator-transitioner'],
        })
        this.render = window.domBuilder.build({
            type: 'div',
            classNames: ['mynah-toggle-container'],
            attributes: { disabled: props.disabled === true ? 'disabled' : '' },
            children: this.getChildren(props.value),
        })

        if (props.value !== undefined) {
            this.setRelocatePosition(props.value)
        }
    }

    private readonly getChildren = (value?: string): any[] => [
        ...this.props.options.map(option => {
            if (option.value === value && option.color !== undefined) {
                this.relocateTransitioner.style.backgroundColor = option.color
            }
            return window.domBuilder.build({
                type: 'span',
                attributes: { key: `${this.props.name}-${option.value}` },
                children: [
                    {
                        type: 'input',
                        classNames: ['mynah-toggle-option'],
                        attributes: {
                            type: 'radio',
                            id: `${this.props.name}-${option.value}`,
                            name: this.props.name,
                            ...(value === option.value ? { checked: 'checked' } : {}),
                        },
                        events: {
                            change: () => {
                                this.updateSelectionRender(option.value, option.color)
                            },
                        },
                    },
                    {
                        type: 'label',
                        classNames: ['mynah-toggle-option-label'],
                        attributes: {
                            for: `${this.props.name}-${option.value}`,
                            ...(option.color !== undefined ? { style: `background-color:${option.color}` } : {}),
                        },
                        children: [option.label ?? ''],
                    },
                ],
            })
        }),
        this.relocateTransitioner,
    ]

    private readonly setRelocatePosition = (value: string, color?: string): void => {
        setTimeout(() => {
            const renderRect = this.render.getBoundingClientRect()
            // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions, @typescript-eslint/prefer-nullish-coalescing
            const rect = this.render
                .querySelector(`label[for="${this.props.name}-${value}"]`)
                ?.getBoundingClientRect() || {
                top: 0,
                left: 0,
                width: 0,
                height: 0,
            }

            this.relocateTransitioner.style.top = `${rect.top - renderRect.top}px`
            this.relocateTransitioner.style.left = `${rect.left - renderRect.left}px`
            this.relocateTransitioner.style.width = `${rect.width}px`
            this.relocateTransitioner.style.height = `${rect.height}px`
            if (color !== undefined) {
                this.relocateTransitioner.style.backgroundColor = color
            }
        }, 5)
    }

    private readonly updateSelectionRender = (value: string, color?: string): void => {
        this.relocateTransitioner.removeClass('relocate')
        this.setRelocatePosition(value, color)

        setTimeout(() => {
            this.relocateTransitioner.addClass('relocate')
            if (this.props.onChange !== undefined) {
                this.props.onChange(value)
            }
        }, 200)
    }

    setValue = (value: string): void => {
        // Since the html elements are not interactable when there is no user action
        // such as a real physical input event, we need to redraw the elements
        this.render.update({ children: this.getChildren(value) })
        this.setRelocatePosition(value)
    }
}
