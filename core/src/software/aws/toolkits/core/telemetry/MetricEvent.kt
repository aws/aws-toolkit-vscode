// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.telemetry

import software.amazon.awssdk.services.toolkittelemetry.model.Unit as MetricUnit
import software.aws.toolkits.core.utils.getLogger
import java.time.Instant

interface MetricEvent {
    val namespace: String
    val createTime: Instant
    val data: Iterable<Datum>

    interface Builder {
        fun namespace(namespace: String): Builder

        fun createTime(createTime: Instant): Builder

        fun datum(buildDatum: Datum.Builder.() -> Unit): Builder

        fun build(): MetricEvent
    }

    interface Datum {
        val name: String
        val value: Double
        val unit: MetricUnit
        val metadata: Map<String, String>

        interface Builder {
            fun name(name: String): Builder

            fun value(value: Double): Builder

            fun unit(unit: MetricUnit): Builder

            fun metadata(key: String, value: String): Builder

            fun build(): Datum
        }
    }
}

class DefaultMetricEvent(
    override val namespace: String,
    override val createTime: Instant,
    override val data: Iterable<MetricEvent.Datum>
) : MetricEvent {
    class BuilderImpl : MetricEvent.Builder {
        private var namespace: String? = null
        private var createTime: Instant = Instant.now()
        private var data: MutableCollection<MetricEvent.Datum> = mutableListOf()

        override fun namespace(namespace: String): MetricEvent.Builder {
            this.namespace = namespace
            return this
        }

        override fun createTime(createTime: Instant): MetricEvent.Builder {
            this.createTime = createTime
            return this
        }

        override fun datum(buildDatum: MetricEvent.Datum.Builder.() -> Unit): MetricEvent.Builder {
            val builder = DefaultDatum.builder()
            buildDatum(builder)
            data.add(builder.build())
            return this
        }

        override fun build(): MetricEvent {
            val namespace: String = this.namespace
                    ?: throw IllegalArgumentException("Cannot build MetricEvent.Datum without a namespace").also {
                        LOG.error(it.message, it)
                    }

            return DefaultMetricEvent(namespace, createTime, data)
        }
    }

    companion object {
        private val LOG = getLogger<DefaultMetricEvent>()

        fun builder(): MetricEvent.Builder = BuilderImpl()
    }

    class DefaultDatum(
        override val name: String,
        override val value: Double,
        override val unit: MetricUnit,
        override val metadata: Map<String, String>
    ) : MetricEvent.Datum {
        class BuilderImpl : MetricEvent.Datum.Builder {
            private var name: String? = null
            private var value: Double = 0.0
            private var unit: MetricUnit = MetricUnit.NONE
            private val metadata: MutableMap<String, String> = HashMap()

            override fun name(name: String): MetricEvent.Datum.Builder {
                this.name = name
                return this
            }

            override fun value(value: Double): MetricEvent.Datum.Builder {
                this.value = value
                return this
            }

            override fun unit(unit: MetricUnit): MetricEvent.Datum.Builder {
                this.unit = unit
                return this
            }

            override fun metadata(key: String, value: String): MetricEvent.Datum.Builder {
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

            override fun build(): MetricEvent.Datum {
                val name: String = this.name
                    ?: throw IllegalArgumentException("Cannot build MetricEvent.Datum without a name").also {
                        LOG.error(it.message, it)
                    }

                return DefaultDatum(
                        name,
                        this.value,
                        this.unit,
                        this.metadata
                )
            }
        }

        companion object {
            private val LOG = getLogger<DefaultDatum>()

            fun builder(): MetricEvent.Datum.Builder = BuilderImpl()

            const val MAX_METADATA_ENTRIES: Int = 10
        }
    }
}
