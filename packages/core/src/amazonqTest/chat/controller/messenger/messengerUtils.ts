/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 *
 */

// These enums map to string IDs
export enum ButtonActions {
    ACCEPT = 'Accept',
    MODIFY = 'Modify',
    REJECT = 'Reject',
    VIEW_DIFF = 'View-Diff',
    STOP_TEST_GEN = 'Stop-Test-Generation',
    STOP_BUILD = 'Stop-Build-Process',
}

// TODO: Refactor the common functionality between Transform, FeatureDev, CWSPRChat, Scan and UTG to a new Folder.

export default class MessengerUtils {
    static stringToEnumValue = <T extends { [key: string]: string }, K extends keyof T & string>(
        enumObject: T,
        value: `${T[K]}`
    ): T[K] => {
        if (Object.values(enumObject).includes(value)) {
            return value as unknown as T[K]
        } else {
            throw new Error('Value provided was not found in Enum')
        }
    }
}
