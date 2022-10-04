/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExtendedHTMLElement } from '../../helper/dom'
import { LiveSearchState } from '../../helper/static'
import { Icon, MynahIcons } from '../icon'
import { Toggle } from '../toggle'

const LiveSearchStateColors = {
    [LiveSearchState.PAUSE]: 'var(--mynah-color-status-warning)',
    [LiveSearchState.RESUME]: 'var(--mynah-color-status-success)',
}

export interface SearchLiveToggleProps {
    label: string
    value: LiveSearchState.RESUME | LiveSearchState.PAUSE
    onChange?: (value: LiveSearchState.RESUME | LiveSearchState.PAUSE) => void
}
export class SearchLiveToggle {
    render: ExtendedHTMLElement
    private readonly toggle: Toggle
    constructor(props: SearchLiveToggleProps) {
        this.toggle = new Toggle({
            name: 'mynah-implicit-search',
            value: props.value,
            options: [
                {
                    label: new Icon({ icon: MynahIcons.PLAY }).render,
                    value: LiveSearchState.RESUME,
                    color: LiveSearchStateColors[LiveSearchState.RESUME],
                },
                {
                    label: new Icon({ icon: MynahIcons.PAUSE }).render,
                    value: LiveSearchState.PAUSE,
                    color: LiveSearchStateColors[LiveSearchState.PAUSE],
                },
            ],
            onChange: value => {
                if (props.onChange !== undefined) {
                    props.onChange(value as LiveSearchState.RESUME | LiveSearchState.PAUSE)
                }
            },
        })
        this.render = window.domBuilder.build({
            type: 'div',
            classNames: ['mynah-search-live-toggle-wrapper'],
            children: [{ type: 'b', children: [props.label] }, this.toggle.render],
        })
    }

    setToggleState = (state: LiveSearchState): void => {
        this.toggle.setValue(state)
    }

    flashToggle = (): void => {
        this.render.removeClass('flash-toggle')
        setTimeout(() => {
            this.render.addClass('flash-toggle')
        }, 100)
    }
}
