/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventBus, Queue } from './interfaces'

export class EventEmittingQueue<T> implements Queue<T> {
    private store: T[]
    private eventBus: EventBus
    private maxLength: number
    private fillThreshold: number

    constructor(store: T[], eventBus: EventBus, maxLength: number, fillThreshold: number) {
        this.store = store
        this.eventBus = eventBus
        this.maxLength = maxLength
        if (fillThreshold <= 0 || fillThreshold > 1) {
            throw `Invalid fillThreshold: ${fillThreshold}. fillThreshold must be greater than 0 and less than 1`
        }
        this.fillThreshold = fillThreshold
    }

    enqueue(item: T): boolean {
        if (this.isFull()) {
            this.eventBus.emit(QueueEvents.QUEUE_FULL, item)
            return false
        }
        this.store.push(item)
        this.eventBus.emit(QueueEvents.ENQUEUE, item)
        if (this.isAtFillThreshold()) {
            this.eventBus.emit(QueueEvents.QUEUE_FILL_THRESHOLD_REACHED, item)
        }
        return true
    }

    dequeue(): T | undefined {
        const item = this.store.shift()
        if (item !== undefined) {
            this.eventBus.emit(QueueEvents.DEQUEUE, item)
        }
        return item
    }

    peek(): T | undefined {
        const item = this.store[0]
        if (item !== undefined) {
            this.eventBus.emit(QueueEvents.PEEK, item)
        }
        return item
    }

    batchPeek(itemCount: number): T[] {
        let items = new Array<T>()
        if (itemCount < 1) {
            return items
        }
        items = this.store.slice(0, itemCount)
        this.eventBus.emit(QueueEvents.BATCH_PEEK, items)
        return items
    }

    batchDequeue(itemCount: number): T[] {
        let items = new Array<T>()
        if (itemCount < 1) {
            return items
        }
        items = this.store.splice(0, itemCount)
        this.eventBus.emit(QueueEvents.BATCH_DEQUEUE, items)
        return items
    }

    length(): number {
        return this.store.length
    }

    private isAtFillThreshold(): boolean {
        const threshold = this.fillThreshold * this.maxLength
        return this.store.length >= threshold
    }

    private isFull(): boolean {
        return !(this.store.length < this.maxLength)
    }
}

export enum QueueEvents {
    ENQUEUE = 'ENQUEUE',
    DEQUEUE = 'DEQUEUE',
    PEEK = 'PEEK',
    BATCH_PEEK = 'BATCH_PEEK',
    BATCH_DEQUEUE = 'BATCH_DEQUEUE',
    QUEUE_FILL_THRESHOLD_REACHED = 'QUEUE_THRESHOLD_REACHED',
    QUEUE_FULL = 'QUEUE_FULL',
}
