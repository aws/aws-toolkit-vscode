/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { platform, release } from 'os'
import { TelemetryClient } from './client'
import { ClientEventBus } from './clientEventBus'
import {
    TELEMETRY_MAX_PUBLISH_ITERATIONS,
    TELEMETRY_PUBLISH_BATCH_SIZE,
    TELEMETRY_PUBLISH_INTERVAL,
    TELEMETRY_QUEUE_FILL_THRESHOLD,
    TELMETRY_QUEUE_MAX_LENGTH,
} from './configuration'
import { EventEmittingQueue } from './eventEmittingQueue'
import { EventBus, Queue } from './interfaces'
import { TelemetryClientFactoryProps, TelemetryClientProps, TelemetryEvent } from './types'
import { TelemetryPublisher } from './publisher'

const eventBus: EventBus = new ClientEventBus()
const queue: Queue<TelemetryEvent> = new EventEmittingQueue(
    [],
    eventBus,
    TELMETRY_QUEUE_MAX_LENGTH,
    TELEMETRY_QUEUE_FILL_THRESHOLD
)
let telemetryPublisher: TelemetryPublisher
let telemetryClient: TelemetryClient

const operatingSystem = platform()
const operatingSystemVersion = release()

const TelemetryClientFactory = {
    getInstance: function getClient(props: TelemetryClientFactoryProps) {
        if (telemetryClient) {
            return telemetryClient
        }
        telemetryPublisher = new TelemetryPublisher({
            queue: queue,
            eventBus: eventBus,
            identityId: props.identityId,
            publishInterval: TELEMETRY_PUBLISH_INTERVAL,
            publishBatchSize: TELEMETRY_PUBLISH_BATCH_SIZE,
            maxPublishIterations: TELEMETRY_MAX_PUBLISH_ITERATIONS,
        })

        telemetryPublisher.ready().then(values => telemetryPublisher.start(values as unknown[]))

        const telemetryClientProps: TelemetryClientProps = {
            ...props,
            operatingSystem,
            operatingSystemVersion,
            queue,
        }
        telemetryClient = new TelemetryClient(telemetryClientProps)
        return telemetryClient
    },
}

export { TelemetryClientFactory, TelemetryClientFactoryProps }
