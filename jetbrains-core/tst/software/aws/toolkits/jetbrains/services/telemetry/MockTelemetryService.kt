// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.telemetry

import software.aws.toolkits.core.telemetry.DefaultMetricEvent
import software.aws.toolkits.core.telemetry.MetricEvent

class MockTelemetryService : TelemetryService {
    override fun record(namespace: String, buildEvent: MetricEvent.Builder.() -> kotlin.Unit): MetricEvent {
        val builder = DefaultMetricEvent.builder(namespace)
        buildEvent(builder)
        return builder.build()
    }

    override fun dispose() {
    }
}
