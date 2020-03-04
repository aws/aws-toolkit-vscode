// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.telemetry

import kotlinx.coroutines.runBlocking
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

    fun enqueue(events: Collection<MetricEvent>)

    fun flush(retry: Boolean)

    /**
     * Immediately shutdown the current batcher and delegate remaining events to a new batcher
     */
    fun setBatcher(batcher: TelemetryBatcher)

    fun onTelemetryEnabledChanged(newValue: Boolean)

    fun shutdown()
}

open class DefaultTelemetryBatcher(
    private val publisher: TelemetryPublisher,
    private val maxBatchSize: Int = DEFAULT_MAX_BATCH_SIZE,
    maxQueueSize: Int = DEFAULT_MAX_QUEUE_SIZE,
    private val executor: ScheduledExecutorService = createDefaultExecutor()
) : TelemetryBatcher {

    private val isTelemetryEnabled: AtomicBoolean = AtomicBoolean(false)
    protected val eventQueue: LinkedBlockingDeque<MetricEvent> = LinkedBlockingDeque(maxQueueSize)
    private val isShuttingDown: AtomicBoolean = AtomicBoolean(false)

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
        enqueue(listOf(event))
    }

    override fun enqueue(events: Collection<MetricEvent>) {
        try {
            eventQueue.addAll(events)
        } catch (e: Exception) {
            LOG.warn(e) { "Failed to add metric to queue" }
        }
    }

    override fun flush(retry: Boolean) {
        flush(retry, isTelemetryEnabled.get())
    }

    @Synchronized
    override fun setBatcher(batcher: TelemetryBatcher) {
        executor.shutdown()
        batcher.onTelemetryEnabledChanged(isTelemetryEnabled.get())
        batcher.enqueue(eventQueue.toList())
    }

    // TODO: This should flush to disk instead of network on shutdown. User should not have to wait for network calls to exit. Also consider handling clock drift
    @Synchronized
    private fun flush(retry: Boolean, publish: Boolean) {
        if (!publish || !TELEMETRY_ENABLED) {
            eventQueue.clear()
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

    override fun onTelemetryEnabledChanged(newValue: Boolean) = isTelemetryEnabled.set(newValue)

    companion object {
        private val LOG = getLogger<DefaultTelemetryBatcher>()
        private const val DEFAULT_MAX_BATCH_SIZE = 20
        private const val DEFAULT_MAX_QUEUE_SIZE = 10000
        private const val DEFAULT_PUBLISH_INTERVAL = 5L
        private val DEFAULT_PUBLISH_INTERVAL_UNIT = TimeUnit.MINUTES

        private const val TELEMETRY_KEY = "aws.toolkits.enableTelemetry"
        val TELEMETRY_ENABLED = System.getProperty(TELEMETRY_KEY)?.toBoolean() ?: true

        private fun createDefaultExecutor() = Executors.newSingleThreadScheduledExecutor {
            val daemonThread = Thread(it)
            daemonThread.isDaemon = true
            daemonThread.name = "AWS-Toolkit-Metrics-Publisher"
            daemonThread
        }
    }
}
