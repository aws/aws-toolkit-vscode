/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TelemetryEventName, TelemetryMetadata } from './types'

export interface EventHandler {
    (...args: any[]): void
}

export interface Queue<T> {
    enqueue(t: T): boolean
    dequeue(): T | undefined
    peek(): T | undefined
    batchPeek(count: number): T[]
    batchDequeue(count: number): T[]
    length(): number
}

export interface EventBus {
    subscribe(eventName: string | symbol, handler: EventHandler): void
    unsubscribe(eventName: string | symbol, handler: EventHandler): void
    emit(eventName: string | symbol, ...args: any[]): void
}

export interface Telemetry {
    newSession(viewId: string): TelemetrySession
}

export interface TelemetrySession {
    recordEvent(eventName: TelemetryEventName, metadata?: TelemetryMetadata): void
}
