package com.amazonaws.intellij.core.region

import com.amazonaws.partitions.model.Partition
import com.amazonaws.partitions.model.Partitions
import com.amazonaws.partitions.model.Region
import com.amazonaws.regions.RegionUtils
import com.amazonaws.util.IOUtils
import com.fasterxml.jackson.core.JsonParser
import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.databind.MapperFeature
import com.fasterxml.jackson.databind.ObjectMapper
import java.io.IOException
import java.io.InputStream

/**
 * Created by zhaoxiz on 7/20/17.
 */
object AwsRegionManager {

    private val regions = mutableListOf<AwsRegion>()

    init {
        val partitions = PartitionLoader.build()
        if (partitions != null && partitions.partitions != null) {
            for (partition: Partition in partitions.partitions) for ((key, value) in partition.regions) {
                regions.add(AwsRegion(key, value.description))
            }
        }
    }

    fun getRegions(): List<AwsRegion> {
        return regions
    }

    fun isServiceSupported(region: String, serviceName: String): Boolean {
        return RegionUtils.getRegion(region).isServiceSupported(serviceName)
    }
}

private object PartitionLoader {
    //TODO This endpoint file should be update-to-date file
    private const val JAVA_SDK_PARTITION_RESOURCE_PATH = "com/amazonaws/partitions/endpoints.json"

    private val mapper = ObjectMapper()
            .disable(MapperFeature.CAN_OVERRIDE_ACCESS_MODIFIERS)
            .disable(MapperFeature.ALLOW_FINAL_FIELDS_AS_MUTATORS)
            .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
            .enable(JsonParser.Feature.ALLOW_COMMENTS)

    fun build(): Partitions? {
        val inputStream = PartitionLoader::class.java.classLoader.getResourceAsStream(JAVA_SDK_PARTITION_RESOURCE_PATH)

        return loadPartitionsFromStream(inputStream, JAVA_SDK_PARTITION_RESOURCE_PATH)
    }

    private fun loadPartitionsFromStream(stream: InputStream, location: String): Partitions? {
        return try {
            mapper.readValue<Partitions>(stream, Partitions::class.java)
        } catch (e: IOException) {
            //TODO How do we report this error when failed to load the endpoints
            println("Error: failed to load file from $location !")
            null
        } finally {
            IOUtils.closeQuietly(stream, null)
        }
    }
}