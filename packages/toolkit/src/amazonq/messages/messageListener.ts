/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'vscode'

export class MessageListener<T> {
    constructor(private readonly eventEmitter: EventEmitter<T>) {}

    public onMessage(listener: (e: T) => any) {
        return this.eventEmitter.event(listener)
    }
}
