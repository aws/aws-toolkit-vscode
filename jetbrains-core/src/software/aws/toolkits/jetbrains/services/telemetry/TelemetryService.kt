// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.telemetry

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.ServiceManager
import com.intellij.openapi.project.Project
import com.intellij.util.messages.Topic
import software.amazon.awssdk.services.toolkittelemetry.model.Sentiment
import software.amazon.awssdk.services.toolkittelemetry.model.Unit.MILLISECONDS
import software.aws.toolkits.core.telemetry.DefaultMetricEvent
import software.aws.toolkits.core.telemetry.DefaultMetricEvent.Companion.METADATA_NA
import software.aws.toolkits.core.telemetry.DefaultMetricEvent.Companion.METADATA_NOT_SET
import software.aws.toolkits.core.telemetry.DefaultTelemetryBatcher
import software.aws.toolkits.core.telemetry.MetricEvent
import software.aws.toolkits.core.telemetry.TelemetryBatcher
import software.aws.toolkits.jetbrains.core.credentials.activeAwsAccount
import software.aws.toolkits.jetbrains.core.credentials.activeRegion
import software.aws.toolkits.jetbrains.settings.AwsSettings
import java.time.Duration
import java.time.Instant
import java.util.concurrent.CompletableFuture
import java.util.concurrent.atomic.AtomicBoolean

interface TelemetryService : Disposable {
    data class MetricEventMetadata(
        val awsAccount: String = METADATA_NA,
        val awsRegion: String = METADATA_NA
    )

    fun record(metricEventMetadata: MetricEventMetadata, buildEvent: MetricEvent.Builder.() -> Unit = {}): MetricEvent

    fun record(project: Project?, buildEvent: MetricEvent.Builder.() -> Unit = {}): CompletableFuture<MetricEvent> {
        val metricEvent = CompletableFuture<MetricEvent>()
        ApplicationManager.getApplication().executeOnPooledThread {
            try {
                val metricEventMetadata = if (project == null) MetricEventMetadata() else MetricEventMetadata(
                    awsAccount = project.activeAwsAccount() ?: METADATA_NOT_SET,
                    awsRegion = project.activeRegion().id
                )
                metricEvent.complete(record(metricEventMetadata, buildEvent))
            } catch (e: Exception) {
                metricEvent.completeExceptionally(e)
            }
        }
        return metricEvent
    }

    suspend fun sendFeedback(sentiment: Sentiment, comment: String)

    companion object {
        @JvmStatic
        fun getInstance(): TelemetryService = ServiceManager.getService(TelemetryService::class.java)

        @JvmStatic
        fun syncPublisher() = ApplicationManager.getApplication().messageBus.syncPublisher(TELEMETRY_TOPIC)

        @JvmStatic
        fun subscribe(notifier: TelemetryEnabledChangedNotifier) {
            ApplicationManager.getApplication().messageBus.connect().subscribe(TELEMETRY_TOPIC, notifier)
        }

        private val TELEMETRY_TOPIC: Topic<TelemetryEnabledChangedNotifier> = Topic.create(
            "TELEMETRY_ENABLED_TOPIC",
            TelemetryEnabledChangedNotifier::class.java
        )
    }
}

interface TelemetryEnabledChangedNotifier {
    fun notify(isTelemetryEnabled: Boolean)
}

class DefaultTelemetryService(settings: AwsSettings) :
    TelemetryService, TelemetryEnabledChangedNotifier {
    private val publisher = DefaultTelemetryPublisher()
    var batcher: TelemetryBatcher = DefaultTelemetryBatcher(publisher)
        set(value) {
            batcher.setBatcher(value)
            field = value
        }

    private val isDisposing: AtomicBoolean = AtomicBoolean(false)
    private val startTime: Instant

    init {
        TelemetryService.subscribe(this)
        TelemetryService.syncPublisher().notify(settings.isTelemetryEnabled)

        // TODO this startup stuff should be moved to a global startup task instead of in the constructor FIX_WHEN_MIN_IS_193
        // The auto generated telemetry cannot be used here. It tries to get the instance while
        // constructing it which causes a circular dependency issue.
        record("session_start").also {
            startTime = it.createTime
        }
    }

    override fun notify(isTelemetryEnabled: Boolean) {
        batcher.onTelemetryEnabledChanged(isTelemetryEnabled)
    }

    override fun dispose() {
        if (!isDisposing.compareAndSet(false, true)) {
            return
        }

        // Here we cannot use the auto generated telemetry because we would get the while we are are disposing the instance.
        val endTime = Instant.now()
        record {
            createTime(endTime)
            datum("session_end") {
                value(Duration.between(startTime, endTime).toMillis().toDouble())
                unit(MILLISECONDS)
            }
        }

        batcher.shutdown()
    }

    override fun record(
        metricEventMetadata: TelemetryService.MetricEventMetadata,
        buildEvent: MetricEvent.Builder.() -> Unit
    ): MetricEvent {
        val builder = DefaultMetricEvent.builder()
        buildEvent(builder)
        builder.awsAccount(metricEventMetadata.awsAccount)
        builder.awsRegion(metricEventMetadata.awsRegion)
        val event = builder.build()
        batcher.enqueue(event)
        return event
    }

    override suspend fun sendFeedback(sentiment: Sentiment, comment: String) {
        publisher.sendFeedback(sentiment, comment)
    }

    private fun record(event: MetricEvent.Builder.() -> Unit): MetricEvent = record(TelemetryService.MetricEventMetadata(), event)

    private fun record(metricName: String): MetricEvent = record(TelemetryService.MetricEventMetadata()) {
        this.datum(metricName)
    }
}
