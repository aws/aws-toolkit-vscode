// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.telemetry

import software.aws.toolkits.core.telemetry.MetricEvent.Companion.illegalCharsRegex
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import java.time.Instant
import software.amazon.awssdk.services.toolkittelemetry.model.Unit as MetricUnit

interface MetricEvent {
    val createTime: Instant
    val awsAccount: String
    val awsRegion: String
    val data: Iterable<Datum>

    interface Builder {
        fun createTime(createTime: Instant): Builder

        fun awsAccount(awsAccount: String): Builder

        fun awsRegion(awsRegion: String): Builder

        fun datum(name: String, buildDatum: Datum.Builder.() -> Unit = {}): Builder

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

            fun metadata(key: String, value: Boolean): Builder = metadata(key, value.toString())

            fun count(value: Double = 1.0): Builder {
                value(value)
                unit(MetricUnit.COUNT)
                return this
            }

            fun build(): Datum
        }
    }

    companion object {
        val illegalCharsRegex = "[^\\w+-.:]".toRegex()
    }
}

fun String.replaceIllegal(replacement: String = "") = this.replace(illegalCharsRegex, replacement)

class DefaultMetricEvent internal constructor(
    override val createTime: Instant,
    override val awsAccount: String,
    override val awsRegion: String,
    override val data: Iterable<MetricEvent.Datum>
) : MetricEvent {

    class BuilderImpl : MetricEvent.Builder {
        private var createTime: Instant = Instant.now()
        private var awsAccount: String = METADATA_NA
        private var awsRegion: String = METADATA_NA
        private var data: MutableCollection<MetricEvent.Datum> = mutableListOf()

        override fun createTime(createTime: Instant): MetricEvent.Builder {
            this.createTime = createTime
            return this
        }

        override fun awsAccount(awsAccount: String): MetricEvent.Builder {
            this.awsAccount = awsAccount
            return this
        }

        override fun awsRegion(awsRegion: String): MetricEvent.Builder {
            this.awsRegion = awsRegion
            return this
        }

        override fun datum(name: String, buildDatum: MetricEvent.Datum.Builder.() -> Unit): MetricEvent.Builder {
            val builder = DefaultDatum.builder(name)
            buildDatum(builder)
            data.add(builder.build())
            return this
        }

        override fun build(): MetricEvent = DefaultMetricEvent(createTime, awsAccount, awsRegion, data)
    }

    companion object {
        fun builder() = BuilderImpl()

        const val METADATA_NA = "n/a"
        const val METADATA_NOT_SET = "not-set"
        const val METADATA_INVALID = "invalid"

        private val LOG = getLogger<DefaultDatum>()
    }

    class DefaultDatum(
        override val name: String,
        override val value: Double,
        override val unit: MetricUnit,
        override val metadata: Map<String, String>
    ) : MetricEvent.Datum {
        class BuilderImpl(private var name: String) : MetricEvent.Datum.Builder {
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
                    LOG.warn { "Attempted to add multiple pieces of metadata with the same key" }
                    return this
                }

                if (metadata.size > MAX_METADATA_ENTRIES) {
                    LOG.warn { "Each metric datum may contain a maximum of $MAX_METADATA_ENTRIES metadata entries" }
                    return this
                }

                metadata[key] = value
                return this
            }

            override fun build(): MetricEvent.Datum = DefaultDatum(
                name.replaceIllegal(),
                this.value,
                this.unit,
                this.metadata
            )
        }

        companion object {
            private val LOG = getLogger<DefaultDatum>()

            fun builder(name: String): MetricEvent.Datum.Builder = BuilderImpl(name)

            const val MAX_METADATA_ENTRIES: Int = 10
        }
    }
}
