/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'vscode'

export class MessagePublisher<T> {
    constructor(private readonly eventEmitter: EventEmitter<T>) {}

    public publish(event: T) {
        this.eventEmitter.fire(event)
    }
}
