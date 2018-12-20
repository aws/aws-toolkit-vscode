// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.telemetry

import software.aws.toolkits.core.utils.getLogger
import java.util.concurrent.LinkedBlockingDeque
import java.util.concurrent.atomic.AtomicBoolean

interface TelemetryBatcher {
    fun enqueue(event: MetricEvent)

    fun enqueue(events: Collection<MetricEvent>)

    fun flush(retry: Boolean)

    fun onTelemetryEnabledChanged(newValue: Boolean)

    fun shutdown()
}

open class DefaultTelemetryBatcher(
    private val publisher: TelemetryPublisher,
    private val maxBatchSize: Int = DEFAULT_MAX_BATCH_SIZE,
    maxQueueSize: Int = DEFAULT_MAX_QUEUE_SIZE
) : TelemetryBatcher {

    private val isTelemetryEnabled: AtomicBoolean = AtomicBoolean(false)
    protected val eventQueue: LinkedBlockingDeque<MetricEvent> = LinkedBlockingDeque(maxQueueSize)
    private val isShuttingDown: AtomicBoolean = AtomicBoolean(false)

    override fun shutdown() {
        if (!isShuttingDown.compareAndSet(false, true)) {
            return
        }

        flush(false)
    }

    override fun enqueue(event: MetricEvent) {
        enqueue(listOf(event))
    }

    override fun enqueue(events: Collection<MetricEvent>) {
        try {
            eventQueue.addAll(events)
        } catch (e: Exception) {
            LOG.warn("Failed to add metric to queue", e)
        }
    }

    override fun flush(retry: Boolean) {
        flush(retry, isTelemetryEnabled.get())
    }

    // TODO: This should flush to disk instead of network on shutdown. User should not have to wait for network calls to exit. Also consider handling clock drift
    @Synchronized
    private fun flush(retry: Boolean, publish: Boolean) {
        if (!publish) {
            eventQueue.clear()
        }

        while (!eventQueue.isEmpty()) {
            val batch: ArrayList<MetricEvent> = arrayListOf()

            while (!eventQueue.isEmpty() && batch.size < maxBatchSize) {
                batch.add(eventQueue.pop())
            }

            val publishSucceeded = try {
                publisher.publish(batch)
            } catch (e: Exception) {
                LOG.warn("Failed to publish metrics", e)
                false
            }

            if (!publishSucceeded && retry) {
                LOG.warn("Telemetry metrics failed to publish, retrying later...")
                eventQueue.addAll(batch)
                // don't want an infinite loop...
                return
            }
        }
    }

    override fun onTelemetryEnabledChanged(newValue: Boolean) = isTelemetryEnabled.set(newValue)

    companion object {
        private val LOG = getLogger<DefaultTelemetryBatcher>()
        private const val DEFAULT_MAX_BATCH_SIZE = 20
        private const val DEFAULT_MAX_QUEUE_SIZE = 10000
    }
}
