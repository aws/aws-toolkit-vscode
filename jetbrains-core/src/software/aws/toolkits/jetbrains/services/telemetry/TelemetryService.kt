// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.telemetry

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationInfo
import com.intellij.openapi.application.ApplicationNamesInfo
import com.intellij.openapi.components.ServiceManager
import com.intellij.openapi.util.SystemInfo
import software.amazon.awssdk.auth.credentials.AnonymousCredentialsProvider
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.cognitoidentity.CognitoIdentityClient
import software.amazon.awssdk.services.toolkittelemetry.ToolkitTelemetryClient
import software.amazon.awssdk.services.toolkittelemetry.model.AWSProduct
import software.amazon.awssdk.services.toolkittelemetry.model.Unit
import software.aws.toolkits.core.ToolkitClientManager
import software.aws.toolkits.core.telemetry.DefaultMetricEvent
import software.aws.toolkits.core.telemetry.DefaultTelemetryBatcher
import software.aws.toolkits.core.telemetry.MetricEvent
import software.aws.toolkits.core.telemetry.TelemetryBatcher
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.AwsToolkit
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.core.AwsSdkClient
import software.aws.toolkits.jetbrains.settings.AwsSettings
import java.time.Duration
import java.time.Instant
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

interface TelemetryService : Disposable {
    fun record(namespace: String, buildEvent: MetricEvent.Builder.() -> kotlin.Unit = {}): MetricEvent

    companion object {
        @JvmStatic
        fun getInstance(): TelemetryService = ServiceManager.getService(TelemetryService::class.java)
    }
}

class DefaultTelemetryService(
    messageBusService: MessageBusService,
    settings: AwsSettings,
    publishInterval: Long,
    publishIntervalUnit: TimeUnit,
    private val executor: ScheduledExecutorService,
    private val batcher: TelemetryBatcher
) : TelemetryService {
    private val isDisposing: AtomicBoolean = AtomicBoolean(false)
    private val startTime: Instant

    @Suppress("unused") // Used by ServiceManager
    constructor(
        sdkClient: AwsSdkClient,
        messageBusService: MessageBusService,
        settings: AwsSettings
    ) : this(
        messageBusService,
        settings,
        DEFAULT_PUBLISH_INTERVAL,
        DEFAULT_PUBLISH_INTERVAL_UNIT,
        createDefaultExecutor(),
        DefaultTelemetryBatcher(DefaultTelemetryPublisher(
            AWSProduct.AWS_TOOLKIT_FOR_JET_BRAINS,
            AwsToolkit.PLUGIN_VERSION,
            settings.clientId.toString(),
            ApplicationNamesInfo.getInstance().fullProductNameWithEdition,
            ApplicationInfo.getInstance().fullVersion,
            ToolkitClientManager.createNewClient(
                ToolkitTelemetryClient::class,
                sdkClient.sdkHttpClient,
                Region.US_EAST_1,
                AWSCognitoCredentialsProvider(
                    "us-east-1:820fd6d1-95c0-4ca4-bffb-3f01d32da842",
                    CognitoIdentityClient.builder()
                        .credentialsProvider(AnonymousCredentialsProvider.create())
                        .region(Region.US_EAST_1)
                        .httpClient(sdkClient.sdkHttpClient)
                        .build()
                ),
                AwsClientManager.userAgent,
                "https://client-telemetry.us-east-1.amazonaws.com"
            ),
            SystemInfo.OS_NAME,
            SystemInfo.OS_VERSION
        ))
    )

    init {
        messageBusService.messageBus.connect().subscribe(
                messageBusService.telemetryEnabledTopic,
                object : TelemetryEnabledChangedNotifier {
                    override fun notify(isTelemetryEnabled: Boolean) {
                        batcher.onTelemetryEnabledChanged(isTelemetryEnabled)
                    }
                }
        )
        messageBusService.messageBus.syncPublisher(messageBusService.telemetryEnabledTopic)
                .notify(settings.isTelemetryEnabled)

        executor.scheduleWithFixedDelay(
                PublishActivity(),
                publishInterval,
                publishInterval,
                publishIntervalUnit
        )

        record("ToolkitStart").also {
            startTime = it.createTime
        }
    }

    override fun dispose() {
        if (!isDisposing.compareAndSet(false, true)) {
            return
        }

        executor.shutdown()

        val endTime = Instant.now()
        record("ToolkitEnd") {
            createTime(endTime)
            datum("duration") {
                value(Duration.between(startTime, endTime).toMillis().toDouble())
                unit(Unit.MILLISECONDS)
            }
        }

        batcher.shutdown()
    }

    override fun record(namespace: String, buildEvent: MetricEvent.Builder.() -> kotlin.Unit): MetricEvent {
        val builder = DefaultMetricEvent.builder(namespace)
        buildEvent(builder)
        val event = builder.build()
        batcher.enqueue(event)
        return event
    }

    private inner class PublishActivity : Runnable {
        override fun run() {
            if (isDisposing.get()) {
                return
            }
            try {
                batcher.flush(true)
            } catch (e: Exception) {
                LOG.warn(e) { "Unexpected exception while publishing telemetry" }
            }
        }
    }

    companion object {
        private val LOG = getLogger<TelemetryService>()
        private const val DEFAULT_PUBLISH_INTERVAL = 5L
        private val DEFAULT_PUBLISH_INTERVAL_UNIT = TimeUnit.MINUTES

        private fun createDefaultExecutor() = Executors.newSingleThreadScheduledExecutor {
            val daemonThread = Thread(it)
            daemonThread.isDaemon = true
            daemonThread.name = "AWS-Toolkit-Metrics-Publisher"
            daemonThread
        }
    }
}
