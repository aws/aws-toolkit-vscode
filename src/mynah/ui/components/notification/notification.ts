/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { cancelEvent, DomBuilderObject, DS, ExtendedHTMLElement } from '../../helper/dom'
import { Icon, MynahIcons } from '../icon'
import { Overlay, OverlayHorizontalDirection, OverlayVerticalDirection, OVERLAY_MARGIN } from '../overlay/overlay'

/**
 * Mapping for extension notify implementation
 */
const NotificationTypeMap: Record<string, string> = {
    [MynahIcons.INFO]: 'info',
    [MynahIcons.OK_CIRCLED]: 'info',
    [MynahIcons.WARNING]: 'warning',
    [MynahIcons.ERROR]: 'error',
}

/**
 * Options for where to show the notification
 */
export enum NotificationTarget {
    /**
     * Shows an IDE level notification
     */
    IDE = 'ide',
    /**
     * Shows a notification inside the extension UI
     */
    UI = 'ui',
}

export enum NotificationType {
    INFO = MynahIcons.INFO,
    SUCCESS = MynahIcons.OK_CIRCLED,
    WARNING = MynahIcons.WARNING,
    ERROR = MynahIcons.ERROR,
}

export interface NotificationProps {
    duration?: number
    target?: NotificationTarget
    type?: NotificationType
    title?: string
    content: string | ExtendedHTMLElement | HTMLElement | DomBuilderObject
    onNotificationClick?: () => void
    onNotificationHide?: () => void
}

export class Notification {
    private notificationOverlay!: Overlay
    private readonly duration
    private readonly target
    private readonly type
    private readonly props

    constructor(props: NotificationProps) {
        this.duration = props.duration !== undefined ? props.duration : 5000
        this.target = props.target ?? NotificationTarget.UI
        this.type = props.type ?? NotificationType.INFO
        this.props = props
    }

    public notify(): void {
        switch (this.target) {
            case NotificationTarget.UI:
                this.notificationOverlay = new Overlay({
                    referencePoint: {
                        left: Math.max(document.documentElement.clientWidth ?? 0, window.innerWidth ?? 0),
                        top: this.getNextCalculatedTop(),
                    },
                    dimOutside: false,
                    closeOnOutsideClick: false,
                    horizontalDirection: OverlayHorizontalDirection.TO_LEFT,
                    verticalDirection: OverlayVerticalDirection.TO_BOTTOM,
                    onClose: this.props.onNotificationHide,
                    children: [
                        {
                            type: 'div',
                            classNames: [
                                'mynah-notification',
                                this.props.onNotificationClick !== undefined ? 'mynah-notification-clickable' : '',
                            ],
                            events: {
                                click: e => {
                                    cancelEvent(e)
                                    if (this.props.onNotificationClick !== undefined) {
                                        this.props.onNotificationClick()
                                        this.notificationOverlay?.close()
                                    }
                                },
                            },
                            children: [
                                new Icon({ icon: this.type.toString() as MynahIcons }).render,
                                {
                                    type: 'div',
                                    classNames: ['mynah-notification-container'],
                                    children: [
                                        {
                                            type: 'h3',
                                            classNames: ['mynah-notification-title'],
                                            children: [this.props.title ?? ''],
                                        },
                                        {
                                            type: 'div',
                                            classNames: ['mynah-notification-content'],
                                            children: [this.props.content ?? ''],
                                        },
                                    ],
                                },
                            ],
                        },
                    ],
                })

                if (this.duration !== -1) {
                    setTimeout(() => {
                        this.notificationOverlay?.close()
                    }, this.duration)
                }
                break
            case NotificationTarget.IDE:
                if (this.props.title !== undefined || typeof this.props.content === 'string') {
                    window.ideApi.postMessage({
                        command: 'notify',
                        message:
                            this.props.title !== undefined && this.props.title !== ''
                                ? this.props.title
                                : typeof this.props.content === 'string'
                                ? this.props.content
                                : '',
                        details:
                            this.props.title !== undefined &&
                            this.props.title !== '' &&
                            this.props.content !== undefined
                                ? { detail: this.props.content }
                                : undefined,
                        type: NotificationTypeMap[this.type],
                    })
                }
                break
            default:
                break
        }
    }

    /**
     * Calculates the top according to the previously shown and still visible notifications
     * @returns number
     */
    private readonly getNextCalculatedTop = (): number => {
        const prevNotifications = DS('.mynah-notification')
        if (prevNotifications.length > 0) {
            const prevNotificationRectangle = prevNotifications[prevNotifications.length - 1].getBoundingClientRect()
            return prevNotificationRectangle.top + prevNotificationRectangle.height + OVERLAY_MARGIN
        }
        return 0
    }
}
