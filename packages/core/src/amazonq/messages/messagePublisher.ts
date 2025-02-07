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

/**
 * Same as {@link MessagePublisher}, but will wait until the UI indicates it
 * is ready to recieve messages, before the message is published.
 *
 * This solves a problem when running a right click menu option like
 * "Send To Prompt" BUT chat is not opened yet, it would result in the prompt failing to
 * be recieved by chat.
 */
export class UiMessagePublisher<T> extends MessagePublisher<T> {
    private isUiReady: boolean = false
    private buffer: T[] = []

    constructor(eventEmitter: EventEmitter<T>) {
        super(eventEmitter)
    }

    public override publish(event: T): void {
        // immediately send if Chat UI is ready
        if (this.isUiReady) {
            super.publish(event)
            return
        }

        this.buffer.push(event)
    }

    /**
     * Indicate the Q Chat UI is ready to recieve messages.
     */
    public setUiReady() {
        this.isUiReady = true
        this.flush()
    }

    /**
     * Publishes all blocked messages
     */
    private flush() {
        for (const msg of this.buffer) {
            super.publish(msg)
        }
        this.buffer = []
    }
}
