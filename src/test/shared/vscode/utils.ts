/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { types as vscode } from '../../../shared/vscode'

export function createMockEvent<T>(): vscode.Event<T> {
    return (
        listener: (e: T) => any,
        thisArgs?: any,
        disposables?: vscode.Disposable[]
    ) => ({ dispose: () => {} })
}
