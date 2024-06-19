/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export type NotifyUserRequest = {
    command: 'NOTIFY_USER'
    notification: any
    notificationType: 'INFO' | 'WARNING' | 'ERROR'
}
export function notifyUser(request: NotifyUserRequest) {
    // TODO
}
