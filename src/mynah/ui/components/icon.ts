/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExtendedHTMLElement } from '../helper/dom'

export enum MynahIcons {
    MENU = 'menu',
    MINUS = 'minus',
    SEARCH = 'search',
    PLUS = 'plus',
    CHAT = 'chat',
    LINK = 'link',
    EXTERNAL = 'external',
    CANCEL = 'cancel',
    CALENDAR = 'calendar',
    MEGAPHONE = 'megaphone',
    EYE = 'eye',
    OK = 'ok',
    UP_CIRCLED = 'up-circled',
    UP_OPEN = 'up-open',
    DOWN_OPEN = 'down-open',
    RIGHT_OPEN = 'right-open',
    LEFT_OPEN = 'left-open',
    RESIZE_FULL = 'resize-full',
    RESIZE_SMALL = 'resize-small',
    BLOCK = 'block',
    OK_CIRCLED = 'ok-circled',
    INFO = 'info',
    WARNING = 'warning',
    ERROR = 'error',
    THUMBS_UP = 'thumbs-up',
    THUMBS_DOWN = 'thumbs-down',
    STAR = 'star',
    LIGHT_BULB = 'light-bulb',
    ENVELOPE_SEND = 'envelope-send',
    SEARCH_HISTORY = 'search-history',
    USER = 'user',
    PLAY = 'play',
    PAUSE = 'pause',
    CODE_BLOCK = 'code-block',
    COPY = 'copy',
    TEXT_SELECT = 'text-select',
}

export interface IconProps {
    icon: MynahIcons
    classNames?: string[]
}
export class Icon {
    render: ExtendedHTMLElement
    constructor(props: IconProps) {
        this.render = window.domBuilder.build({
            type: 'i',
            classNames: [
                'mynah-icon',
                `mynah-icon-${props.icon}`,
                ...(props.classNames !== undefined ? props.classNames : []),
            ],
        })
    }
}
