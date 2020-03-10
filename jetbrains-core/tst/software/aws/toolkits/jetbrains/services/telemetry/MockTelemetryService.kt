// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.telemetry

import software.amazon.awssdk.services.toolkittelemetry.model.Sentiment
import software.aws.toolkits.core.telemetry.DefaultMetricEvent
import software.aws.toolkits.core.telemetry.MetricEvent

class MockTelemetryService : TelemetryService {
    override fun record(metricEventMetadata: TelemetryService.MetricEventMetadata, buildEvent: MetricEvent.Builder.() -> Unit): MetricEvent {
        val builder = DefaultMetricEvent.builder()
        buildEvent(builder)
        builder.awsAccount(metricEventMetadata.awsAccount)
        builder.awsRegion(metricEventMetadata.awsRegion)
        return builder.build()
    }

    override suspend fun sendFeedback(sentiment: Sentiment, comment: String) {}

    override fun dispose() {}
}
