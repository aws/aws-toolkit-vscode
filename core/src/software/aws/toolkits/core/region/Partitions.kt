// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.region

import com.fasterxml.jackson.core.JsonParser
import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.databind.MapperFeature
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import org.slf4j.LoggerFactory
import software.aws.toolkits.core.utils.RemoteResource
import software.aws.toolkits.core.utils.tryOrNull
import software.aws.toolkits.resources.BundledResources
import java.io.InputStream
import java.time.Duration

data class Partitions(val partitions: List<Partition>) {
    fun getPartition(name: String): Partition =
        partitions.find { it.partition == name } ?: throw RuntimeException("Partition named '$name' not found")
}

data class Partition(
    val partition: String,
    val partitionName: String,
    val regions: Map<String, PartitionRegion>,
    val services: Map<String, Service>
)

data class PartitionRegion(val description: String)

data class Service(val endpoints: Map<String, Endpoint>, val isRegionalized: Boolean?, val partitionEndpoint: String?) {
    val isGlobal = isRegionalized == false
}

class Endpoint

object PartitionParser {
    private val LOG = LoggerFactory.getLogger(PartitionParser::class.java)

    private val mapper = jacksonObjectMapper()
        .disable(MapperFeature.CAN_OVERRIDE_ACCESS_MODIFIERS)
        .disable(MapperFeature.ALLOW_FINAL_FIELDS_AS_MUTATORS)
        .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
        .enable(JsonParser.Feature.ALLOW_COMMENTS)

    fun parse(inputStream: InputStream): Partitions? = LOG.tryOrNull("Failed to parse Partitions") {
        mapper.readValue<Partitions>(inputStream, Partitions::class.java)
    }
}

object ServiceEndpointResource : RemoteResource {
    override val urls: List<String> = listOf(
        "https://idetoolkits.amazonwebservices.com/endpoints.json",
        "https://aws-toolkit-endpoints.s3.amazonaws.com/endpoints.json"
    )
    override val name: String = "service-endpoints.json"
    override val ttl: Duration? = Duration.ofHours(24)
    override val initialValue: (() -> InputStream)? = { BundledResources.ENDPOINTS_FILE }
}
