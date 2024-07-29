// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.telemetry

import com.intellij.openapi.components.service
import org.junit.jupiter.api.extension.AfterEachCallback
import org.junit.jupiter.api.extension.BeforeEachCallback
import org.junit.jupiter.api.extension.ExtensionContext
import org.junit.rules.ExternalResource
import org.mockito.kotlin.reset
import org.mockito.kotlin.spy
import software.amazon.awssdk.services.toolkittelemetry.model.Sentiment
import software.aws.toolkits.core.telemetry.DefaultTelemetryBatcher
import software.aws.toolkits.core.telemetry.MetricEvent
import software.aws.toolkits.core.telemetry.TelemetryPublisher

class NoOpTelemetryService : TelemetryService(publisher, spy(DefaultTelemetryBatcher(publisher))) {
    fun batcher() = super.batcher

    private companion object {
        private val publisher: TelemetryPublisher by lazy { NoOpPublisher() }
    }
}

class NoOpPublisher : TelemetryPublisher {
    override suspend fun publish(metricEvents: Collection<MetricEvent>) {}

    override suspend fun sendFeedback(sentiment: Sentiment, comment: String, metadata: Map<String, String>) {}

    override fun close() {}
}

sealed class MockTelemetryServiceBase : ExternalResource() {
    private val mockTelemetryService: NoOpTelemetryService
        get() = service<TelemetryService>() as NoOpTelemetryService

    override fun after() {
        reset(batcher())
    }

    fun telemetryService() = mockTelemetryService
    fun batcher() = mockTelemetryService.batcher()
}

class MockTelemetryServiceRule : MockTelemetryServiceBase()

class MockTelemetryServiceExtension : MockTelemetryServiceBase(), BeforeEachCallback, AfterEachCallback {
    override fun beforeEach(context: ExtensionContext?) {
        before()
    }

    override fun afterEach(context: ExtensionContext?) {
        after()
    }
}
