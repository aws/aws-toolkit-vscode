// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.telemetry

import software.aws.toolkits.core.utils.getLogger
import java.time.Instant
import java.util.Collections
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Event that occurred in the Toolkit.
 */
open class Metric internal constructor(internal val metricNamespace: String, private val publisher: MetricsPublisher) :
    AutoCloseable {
    private val closed = AtomicBoolean(false)
    private val entriesMap: MutableMap<String, MetricEntry> = ConcurrentHashMap()

    val createTime: Instant = Instant.now()
    val entries: Map<String, MetricEntry> = Collections.unmodifiableMap(entriesMap)

    /**
     * Finalizes the event and sends it to the [MetricsPublisher] for recording if valid
     */
    override fun close() {
        if (!closed.compareAndSet(false, true)) {
            return
        }

        publisher.publishMetric(this)
    }

    /**
     * Adds a metric to the event
     *
     * @param metricName The name of the entry
     * @param entry A builder to create the entry
     * @return this
     */
    fun addMetricEntry(metricName: String, entry: MetricEntry.Builder.() -> Unit): Metric {
        if (closed.get()) {
            LOG.warn("Attempted to add a metric to a closed metric", Throwable())
            return this
        }

        val builder: MetricEntry.Builder = MetricEntry.builder()
        entry(builder)
        entriesMap[metricName] = builder.build()

        return this
    }

    companion object {
        private val LOG = getLogger<Metric>()
    }
}

/**
 * Unit of measure for the metric
 */
enum class MetricUnit {
    BYTES, COUNT, MILLISECONDS, PERCENT
}

data class MetricEntry private constructor(
    val value: Double,
    val unit: MetricUnit,
    val metadata: Map<String, String> = HashMap()
) {
    interface Builder {
        fun value(value: Double): Builder

        fun unit(unit: MetricUnit): Builder

        fun metadata(key: String, value: String): Builder

        fun build(): MetricEntry
    }

    class BuilderImpl : Builder {
        private var value: Double? = null
        private var unit: MetricUnit? = null
        private val metadata: MutableMap<String, String> = HashMap()

        override fun value(value: Double): Builder {
            this.value = value
            return this
        }

        override fun unit(unit: MetricUnit): Builder {
            this.unit = unit
            return this
        }

        override fun metadata(key: String, value: String): Builder {
            if (metadata.containsKey(key)) {
                LOG.warn("Attempted to add multiple pieces of metadata with the same key")
                return this
            }

            if (metadata.size > MAX_METADATA_ENTRIES) {
                LOG.warn("Each metric datum may contain a maximum of $MAX_METADATA_ENTRIES metadata entries")
                return this
            }

            metadata[key] = value
            return this
        }

        override fun build(): MetricEntry {
            if (value == null) {
                throw Throwable("Each metric entry must have a value")
            }

            if (unit == null) {
                throw Throwable("Each metric entry must have a unit")
            }

            return MetricEntry(value!!, unit!!, metadata)
        }
    }

    companion object {
        private val LOG = getLogger<MetricEntry>()

        fun builder(): Builder = BuilderImpl()

        const val MAX_METADATA_ENTRIES: Int = 10
    }
}