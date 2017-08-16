package com.amazonaws.intellij.core.region

import com.amazonaws.intellij.utils.notifyException
import com.amazonaws.partitions.model.Partitions
import com.amazonaws.regions.RegionUtils
import com.fasterxml.jackson.core.JsonParser
import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.databind.MapperFeature
import com.fasterxml.jackson.databind.ObjectMapper
import com.google.common.collect.ImmutableMap
import com.intellij.openapi.diagnostic.Logger
import java.io.IOException

object AwsRegionManager {
    private const val DEFAULT_REGION = "us-west-2"
    val regions: Map<String, AwsRegion>
    val defaultRegion: AwsRegion

    init {
        val partitions = PartitionLoader.parse()

        val mutableRegionMap = mutableMapOf<String, AwsRegion>()
        partitions?.partitions?.forEach {
            it.regions?.forEach { key, region -> mutableRegionMap.put(key, AwsRegion(key, region.description))}
        }

        regions = ImmutableMap.copyOf(mutableRegionMap)
        //TODO Is there a better way to notify the customer and report the error to us instead of just crash?
        defaultRegion = regions.get(DEFAULT_REGION)!!
    }

    fun lookupRegionById(regionId: String): AwsRegion {
        return regions[regionId]?: defaultRegion
    }

    fun isServiceSupported(region: String, serviceName: String): Boolean {
        return RegionUtils.getRegion(region).isServiceSupported(serviceName)
    }
}

private object PartitionLoader {
    //TODO This endpoint file should be update-to-date file
    private const val JAVA_SDK_PARTITION_RESOURCE_PATH = "com/amazonaws/partitions/endpoints.json"
    private val LOG = Logger.getInstance(PartitionLoader::class.java)

    private val mapper = ObjectMapper()
            .disable(MapperFeature.CAN_OVERRIDE_ACCESS_MODIFIERS)
            .disable(MapperFeature.ALLOW_FINAL_FIELDS_AS_MUTATORS)
            .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
            .enable(JsonParser.Feature.ALLOW_COMMENTS)

    fun parse(): Partitions? {
        PartitionLoader::class.java.classLoader.getResourceAsStream(JAVA_SDK_PARTITION_RESOURCE_PATH).use {
            return try {
                mapper.readValue<Partitions>(it, Partitions::class.java)
            } catch (e: IOException) {
                LOG.error("Error: failed to load file from $JAVA_SDK_PARTITION_RESOURCE_PATH !", e)
                notifyException("Failed to load region endpoint file", e)
                null
            }
        }
    }
}