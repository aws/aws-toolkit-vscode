// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.telemetry

import software.aws.toolkits.core.telemetry.DefaultMetricEvent.Companion.METADATA_NA
import software.aws.toolkits.core.telemetry.DefaultTelemetryBatcher
import software.aws.toolkits.core.telemetry.MetricEvent
import software.aws.toolkits.core.telemetry.TelemetryBatcher
import software.aws.toolkits.core.telemetry.TelemetryPublisher

typealias TelemetryService = migration.software.aws.toolkits.jetbrains.services.telemetry.TelemetryService

data class MetricEventMetadata(
    val awsAccount: String = METADATA_NA,
    val awsRegion: String = METADATA_NA
)

interface TelemetryListener {
    fun onTelemetryEvent(event: MetricEvent)
}

class DefaultTelemetryService : TelemetryService {
    constructor() : super(publisher, batcher)

    private companion object {
        private val publisher: TelemetryPublisher by lazy { DefaultTelemetryPublisher() }
        private val batcher: TelemetryBatcher by lazy { DefaultTelemetryBatcher(publisher) }
    }
}
