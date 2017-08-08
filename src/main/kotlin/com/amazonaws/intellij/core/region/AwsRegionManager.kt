package com.amazonaws.intellij.core.region

import com.amazonaws.partitions.model.Partitions
import com.amazonaws.regions.RegionUtils
import com.amazonaws.util.IOUtils
import com.fasterxml.jackson.core.JsonParser
import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.databind.MapperFeature
import com.fasterxml.jackson.databind.ObjectMapper
import com.intellij.notification.Notification
import com.intellij.notification.NotificationType
import com.intellij.notification.Notifications
import com.intellij.openapi.diagnostic.Logger
import java.io.IOException
import java.io.InputStream

/**
 * Created by zhaoxiz on 7/20/17.
 */
object AwsRegionManager {
    var regions: List<AwsRegion>

    init {
        val partitions = PartitionLoader.parse()
        val loadedRegions = mutableListOf<AwsRegion>()
        partitions?.partitions?.forEach {
            it.regions?.forEach { key, value -> loadedRegions.add(AwsRegion(key, value.description))}
        }
        regions = loadedRegions
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
                Notifications.Bus.notify(Notification("AWS Tookit", "Failed to load region endpoint file", e.message?:e.javaClass.name, NotificationType.ERROR))
                null
            }
        }
    }
}