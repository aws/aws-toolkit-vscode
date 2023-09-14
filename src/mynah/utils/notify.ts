/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vs from 'vscode'
export enum NotificationType {
    INFO = 'info',
    WARNING = 'warning',
    ERROR = 'error',
}
export const showNotification = (notificationType: NotificationType, message: string, detail?: string): void => {
    switch (notificationType) {
        case NotificationType.ERROR:
            void vs.window.showErrorMessage(
                message,
                detail !== undefined && detail !== '' ? ({ detail } as vs.MessageOptions) : {}
            )
            break
        case NotificationType.WARNING:
            void vs.window.showWarningMessage(
                message,
                detail !== undefined && detail !== '' ? ({ detail } as vs.MessageOptions) : {}
            )
            break
        default:
            void vs.window.showInformationMessage(
                message,
                detail !== undefined && detail !== '' ? ({ detail } as vs.MessageOptions) : {}
            )
            break
    }
}
