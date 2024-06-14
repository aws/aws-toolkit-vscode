// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.telemetry

import kotlinx.coroutines.runBlocking
import org.jetbrains.annotations.TestOnly
import software.amazon.awssdk.core.exception.SdkServiceException
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import java.util.concurrent.Executors
import java.util.concurrent.LinkedBlockingDeque
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

interface TelemetryBatcher {
    fun enqueue(event: MetricEvent)

    fun flush(retry: Boolean)

    fun onTelemetryEnabledChanged(isEnabled: Boolean)

    fun shutdown()
}

class DefaultTelemetryBatcher(
    private val publisher: TelemetryPublisher,
    private val maxBatchSize: Int = DEFAULT_MAX_BATCH_SIZE,
    maxQueueSize: Int = DEFAULT_MAX_QUEUE_SIZE,
    private val executor: ScheduledExecutorService = createDefaultExecutor()
) : TelemetryBatcher {
    private val isTelemetryEnabled: AtomicBoolean = AtomicBoolean(false)
    private val isShuttingDown: AtomicBoolean = AtomicBoolean(false)

    val eventQueue: LinkedBlockingDeque<MetricEvent> = LinkedBlockingDeque(maxQueueSize)
        @TestOnly get

    init {
        executor.scheduleWithFixedDelay(
            {
                if (!isShuttingDown.get()) {
                    try {
                        flush(true)
                    } catch (e: Exception) {
                        LOG.warn(e) { "Unexpected exception while publishing telemetry" }
                    }
                }
            },
            DEFAULT_PUBLISH_INTERVAL,
            DEFAULT_PUBLISH_INTERVAL,
            DEFAULT_PUBLISH_INTERVAL_UNIT
        )
    }

    override fun shutdown() {
        if (!isShuttingDown.compareAndSet(false, true)) {
            return
        }

        executor.shutdown()
        flush(false)
    }

    override fun enqueue(event: MetricEvent) {
        if (!isTelemetryEnabled.get()) {
            return
        }

        try {
            eventQueue.add(event)
        } catch (e: Exception) {
            LOG.warn(e) { "Failed to add metric to queue" }
        }
    }

    @Synchronized
    override fun flush(retry: Boolean) {
        if (!isTelemetryEnabled.get()) {
            return
        }

        while (!eventQueue.isEmpty()) {
            val batch: ArrayList<MetricEvent> = arrayListOf()

            while (!eventQueue.isEmpty() && batch.size < maxBatchSize) {
                batch.add(eventQueue.pop())
            }

            val stop = runBlocking {
                try {
                    publisher.publish(batch)
                } catch (e: Exception) {
                    LOG.warn(e) { "Failed to publish metrics" }
                    val shouldRetry = retry && when (e) {
                        is SdkServiceException -> e.statusCode() !in 400..499
                        else -> true
                    }
                    if (shouldRetry) {
                        LOG.warn { "Telemetry metrics failed to publish, retrying later..." }
                        eventQueue.addAll(batch)
                        // don't want an infinite loop...
                        return@runBlocking true
                    }
                }
                return@runBlocking false
            }
            if (stop) {
                return
            }
        }
    }

    override fun onTelemetryEnabledChanged(isEnabled: Boolean) {
        isTelemetryEnabled.set(isEnabled)
        if (!isEnabled) {
            eventQueue.clear()
        }
    }

    companion object {
        private val LOG = getLogger<DefaultTelemetryBatcher>()
        private const val DEFAULT_MAX_BATCH_SIZE = 20
        private const val DEFAULT_MAX_QUEUE_SIZE = 10000
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
