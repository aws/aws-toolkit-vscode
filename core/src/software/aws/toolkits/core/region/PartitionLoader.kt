package software.aws.toolkits.core.region

import com.amazonaws.partitions.model.Partitions
import com.fasterxml.jackson.core.JsonParser
import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.databind.MapperFeature
import com.fasterxml.jackson.databind.ObjectMapper
import org.slf4j.LoggerFactory
import java.io.IOException

// TODO: Refactor this as part of https://github.com/aws/aws-toolkit-jetbrains/issues/94
object PartitionLoader {
    // TODO This endpoint file should be update-to-date file
    private const val JAVA_SDK_PARTITION_RESOURCE_PATH = "com/amazonaws/partitions/endpoints.json"
    private val LOG = LoggerFactory.getLogger(PartitionLoader::class.java)

    private val mapper = ObjectMapper()
        .disable(MapperFeature.CAN_OVERRIDE_ACCESS_MODIFIERS)
        .disable(MapperFeature.ALLOW_FINAL_FIELDS_AS_MUTATORS)
        .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
        .enable(JsonParser.Feature.ALLOW_COMMENTS)

    fun parse(): Partitions? {
        // TODO: Do not use the embedded SDKs version, https://github.com/aws/aws-toolkit-jetbrains/issues/91
        PartitionLoader::class.java.classLoader.getResourceAsStream(JAVA_SDK_PARTITION_RESOURCE_PATH).use {
            return try {
                mapper.readValue<Partitions>(it, Partitions::class.java)
            } catch (e: IOException) {
                LOG.error("Error: failed to load file from $JAVA_SDK_PARTITION_RESOURCE_PATH !", e)
                null
            }
        }
    }
}