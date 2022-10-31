/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'events'
import { EventBus, EventHandler } from './interfaces'

/**
 * This class is an adapter over @type {EventEmitter} to reduce the API surface.
 * This event bus will will be used by multiple objects for asynchronous message
 * passing.
 */
export class ClientEventBus implements EventBus {
    private emitter: EventEmitter

    constructor() {
        this.emitter = new EventEmitter()
    }

    subscribe(eventName: string | symbol, handler: EventHandler) {
        this.emitter.on(eventName, handler)
    }

    unsubscribe(eventName: string | symbol, handler: EventHandler) {
        this.emitter.off(eventName, handler)
    }

    emit(eventName: string | symbol, ...args: any[]) {
        this.emitter.emit(eventName, ...args)
    }
}
