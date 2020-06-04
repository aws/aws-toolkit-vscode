// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.telemetry

import com.intellij.openapi.Disposable
import com.intellij.openapi.components.ServiceManager
import com.intellij.openapi.project.Project
import software.amazon.awssdk.services.toolkittelemetry.model.Sentiment
import software.aws.toolkits.core.telemetry.DefaultMetricEvent
import software.aws.toolkits.core.telemetry.DefaultMetricEvent.Companion.METADATA_NA
import software.aws.toolkits.core.telemetry.DefaultMetricEvent.Companion.METADATA_NOT_SET
import software.aws.toolkits.core.telemetry.DefaultTelemetryBatcher
import software.aws.toolkits.core.telemetry.MetricEvent
import software.aws.toolkits.core.telemetry.TelemetryBatcher
import software.aws.toolkits.core.telemetry.TelemetryPublisher
import software.aws.toolkits.core.utils.tryOrNull
import software.aws.toolkits.jetbrains.core.AwsResourceCache
import software.aws.toolkits.jetbrains.core.credentials.activeRegion
import software.aws.toolkits.jetbrains.services.sts.StsResources
import software.aws.toolkits.jetbrains.settings.AwsSettings
import java.util.concurrent.atomic.AtomicBoolean

abstract class TelemetryService(private val publisher: TelemetryPublisher, private val batcher: TelemetryBatcher) : Disposable {
    data class MetricEventMetadata(
        val awsAccount: String = METADATA_NA,
        val awsRegion: String = METADATA_NA
    )

    private val isDisposing = AtomicBoolean(false)

    init {
        setTelemetryEnabled(AwsSettings.getInstance().isTelemetryEnabled)
    }

    fun record(project: Project?, buildEvent: MetricEvent.Builder.() -> Unit = {}) {
        val metricEventMetadata = if (project == null) MetricEventMetadata() else MetricEventMetadata(
            awsAccount = project.activeAwsAccountIfKnown() ?: METADATA_NOT_SET,
            awsRegion = project.activeRegion().id
        )
        record(metricEventMetadata, buildEvent)
    }

    private fun Project.activeAwsAccountIfKnown(): String? = tryOrNull { AwsResourceCache.getInstance(this).getResourceIfPresent(StsResources.ACCOUNT) }

    @Synchronized
    fun setTelemetryEnabled(isEnabled: Boolean) {
        batcher.onTelemetryEnabledChanged(isEnabled and TELEMETRY_ENABLED)
    }

    override fun dispose() {
        if (!isDisposing.compareAndSet(false, true)) {
            return
        }

        batcher.shutdown()
    }

    fun record(metricEventMetadata: MetricEventMetadata, buildEvent: MetricEvent.Builder.() -> Unit) {
        val builder = DefaultMetricEvent.builder()
        builder.awsAccount(metricEventMetadata.awsAccount)
        builder.awsRegion(metricEventMetadata.awsRegion)

        buildEvent(builder)

        batcher.enqueue(builder.build())
    }

    suspend fun sendFeedback(sentiment: Sentiment, comment: String) {
        publisher.sendFeedback(sentiment, comment)
    }

    companion object {
        private const val TELEMETRY_KEY = "aws.toolkits.enableTelemetry"
        private val TELEMETRY_ENABLED = System.getProperty(TELEMETRY_KEY)?.toBoolean() ?: true

        fun getInstance(): TelemetryService = ServiceManager.getService(TelemetryService::class.java)
    }
}

class DefaultTelemetryService : TelemetryService(PUBLISHER, DefaultTelemetryBatcher(PUBLISHER)) {
    private companion object {
        val PUBLISHER = DefaultTelemetryPublisher()
    }
}
