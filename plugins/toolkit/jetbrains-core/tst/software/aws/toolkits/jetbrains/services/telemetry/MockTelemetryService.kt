// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.telemetry

import software.amazon.awssdk.services.toolkittelemetry.model.Sentiment
import software.aws.toolkits.core.telemetry.DefaultTelemetryBatcher
import software.aws.toolkits.core.telemetry.MetricEvent
import software.aws.toolkits.core.telemetry.TelemetryBatcher
import software.aws.toolkits.core.telemetry.TelemetryPublisher

class NoOpTelemetryService : TelemetryService {
    constructor() : super(publisher, batcher)

    private companion object {
        private val publisher: TelemetryPublisher by lazy { NoOpPublisher() }
        private val batcher: TelemetryBatcher by lazy { DefaultTelemetryBatcher(publisher) }
    }
}

class NoOpPublisher : TelemetryPublisher {
    override suspend fun publish(metricEvents: Collection<MetricEvent>) {}

    override suspend fun sendFeedback(sentiment: Sentiment, comment: String, metadata: Map<String, String>) {}

    override fun close() {}
}
