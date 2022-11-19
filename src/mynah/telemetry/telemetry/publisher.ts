/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { SdkError } from '@aws-sdk/types'
import { defaultRetryDecider } from '@aws-sdk/middleware-retry'
import { QueueEvents } from './eventEmittingQueue'
import { EventBus, Queue } from './interfaces'
import { Scheduler } from './scheduler'
import { TelemetryEvent } from './types'
import { DefaultMynahTelemetryClient } from '../client/mynahtelemetry'
import * as mynahTelemetryClient from '../client/mynahtelemetry'

export interface TelemetryPublisherProps {
    readonly queue: Queue<TelemetryEvent>
    readonly eventBus: EventBus
    readonly identityId: string | Promise<string>
    readonly publishInterval: number
    readonly publishBatchSize: number
    readonly maxPublishIterations: number
}

enum ReadinessIndex {
    IDENTITY_ID,
}

export class TelemetryPublisher {
    private publishScheduler!: Scheduler
    private resolvedIdentityId!: string
    private client!: DefaultMynahTelemetryClient

    constructor(private readonly props: TelemetryPublisherProps) {
        this.publishScheduler = new Scheduler(() => this.publishEvents(), this.props.publishInterval)
    }

    public ready(): Promise<unknown> {
        const promises = []
        promises[ReadinessIndex.IDENTITY_ID] = this.props.identityId
        return Promise.all(promises)
    }

    public async start(values: unknown[]): Promise<void> {
        this.resolvedIdentityId = values[ReadinessIndex.IDENTITY_ID] as string
        this.client = await DefaultMynahTelemetryClient.createDefaultClient(this.resolvedIdentityId)
        this.setupListeners()
        this.publishScheduler.start()
    }

    public stop(): void {
        this.publishScheduler.stop()
    }

    private setupListeners(): void {
        this.props.eventBus.subscribe(QueueEvents.QUEUE_FILL_THRESHOLD_REACHED, () => this.handleQueueFull())
        this.props.eventBus.subscribe(QueueEvents.QUEUE_FULL, () => this.handleQueueFull())
    }

    private async handleQueueFull() {
        this.publishScheduler.executeOnce()
    }

    private async publishEvents(): Promise<void> {
        const identityId = this.resolvedIdentityId
        let iterations = 0
        while (this.props.queue.length() > 0 && iterations < this.props.maxPublishIterations) {
            iterations++
            const events: TelemetryEvent[] = this.props.queue.batchPeek(this.props.publishBatchSize)
            const transformedEvents = events.map(rawEvent => ({ ...rawEvent, identityId }))
            try {
                const request: mynahTelemetryClient.BatchPostEventRequest = {
                    events: transformedEvents as mynahTelemetryClient.Event[],
                }
                await this.client.batchPostEvent(request)
                this.props.queue.batchDequeue(this.props.publishBatchSize)
            } catch (err) {
                const sdkError: SdkError = err as SdkError
                if (!defaultRetryDecider(sdkError)) {
                    this.props.queue.batchDequeue(this.props.publishBatchSize)
                }
            }
        }
    }
}
