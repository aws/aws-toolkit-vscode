/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as uuid from 'uuid'
import { Telemetry, TelemetrySession } from './interfaces'
import { TelemetryClientProps, TelemetryEvent, TelemetryEventName, TelemetryMetadata } from './types'

export class TelemetryClient implements Telemetry {
    constructor(private readonly props: TelemetryClientProps) {}

    newSession(viewId: string) {
        return new TelemetryClientSession({ viewId, ...this.props })
    }
}

interface TelemetrySessionProps extends TelemetryClientProps {
    viewId: string
}

export class TelemetryClientSession implements TelemetrySession {
    private readonly sessionId: string

    constructor(private readonly props: TelemetrySessionProps) {
        this.sessionId = uuid.v4()
    }

    recordEvent(eventName: TelemetryEventName, metadata?: TelemetryMetadata): void {
        const enrichedEvent: TelemetryEvent = this.enrichEvent(eventName, metadata)
        this.props.queue.enqueue(enrichedEvent)
    }

    private enrichEvent(eventName: TelemetryEventName, metadata?: TelemetryMetadata): TelemetryEvent {
        const telemetryEvent: Readonly<TelemetryEvent> = {
            name: eventName,
            timestamp: new Date(),
            id: uuid.v4(),
            viewId: this.props.viewId,
            clientType: this.props.mynahClientType,
            clientVersion: this.props.mynahClientVersion,
            environmentName: this.props.environmentName,
            environmentVersion: this.props.environmentVersion,
            operatingSystem: this.props.operatingSystem,
            operatingSystemVersion: this.props.operatingSystemVersion,
            sessionId: this.sessionId,
            metadata: metadata,
        }
        return telemetryEvent
    }
}
