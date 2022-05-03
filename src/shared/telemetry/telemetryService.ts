/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AwsContext } from '../awsContext'
import { MetricDatum } from './clienttelemetry'
import { TelemetryFeedback } from './telemetryFeedback'

export interface TelemetryService {
    telemetryEnabled: boolean
    persistFilePath: string

    start(): Promise<void>
    shutdown(): Promise<void>
    postFeedback(feedback: TelemetryFeedback): Promise<void>
    record(event: MetricDatum, awsContext?: AwsContext): void
    clearRecords(): void
    /**
     * Only passive telemetry is allowed during startup (except for some known
     * special-cases).
     *
     * Must be called prior to general queue flush.
     */
    assertOnlyPassiveTelemetryInQueue(didReload: boolean): void
}
