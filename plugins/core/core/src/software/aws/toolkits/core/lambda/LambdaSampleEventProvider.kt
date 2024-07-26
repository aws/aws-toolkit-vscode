// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.lambda

import com.fasterxml.jackson.annotation.JsonProperty
import com.fasterxml.jackson.core.JsonParser
import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.databind.MapperFeature
import com.fasterxml.jackson.dataformat.xml.XmlMapper
import com.fasterxml.jackson.dataformat.xml.annotation.JacksonXmlElementWrapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import com.fasterxml.jackson.module.kotlin.registerKotlinModule
import org.slf4j.LoggerFactory
import software.aws.toolkits.core.utils.RemoteResolveParser
import software.aws.toolkits.core.utils.RemoteResource
import software.aws.toolkits.core.utils.RemoteResourceResolver
import software.aws.toolkits.core.utils.inputStream
import software.aws.toolkits.core.utils.readText
import software.aws.toolkits.core.utils.tryOrNull
import java.io.InputStream
import java.time.Duration
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CompletionStage
import java.util.concurrent.atomic.AtomicReference

class LambdaSampleEventProvider(private val resourceResolver: RemoteResourceResolver) {
    private val mapper = XmlMapper().registerKotlinModule().configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false)

    private val manifest = AtomicReference<List<LambdaSampleEvent>?>(null)

    fun get(): CompletionStage<List<LambdaSampleEvent>> {
        val value = manifest.get()
        if (value != null) {
            return CompletableFuture.completedFuture(value)
        } else {
            return resourceResolver.resolve(LambdaSampleEventManifestResource).thenApply { resource ->
                val resolved = mapper.readValue<LambdaSampleEventManifest>(resource.inputStream()).requests.map { request ->
                    LambdaSampleEvent(request.name) {
                        resourceResolver.resolve(LambdaSampleEventResource(request.filename))
                            .thenApply { it?.readText() }
                    }
                }
                manifest.set(resolved)
                resolved
            }
        }
    }
}

open class LambdaSampleEvent(val name: String, private val contentProvider: () -> CompletionStage<String>) {
    val content: CompletionStage<String> by lazy { contentProvider() }
    override fun toString() = name
}

data class LambdaSampleEventManifest(
    @JsonProperty(value = "request")
    @JacksonXmlElementWrapper(useWrapping = false)
    val requests: List<LambdaSampleEventRequest>
)

data class LambdaSampleEventRequest(
    val filename: String,
    val name: String
)

internal val LambdaSampleEventManifestResource = LambdaSampleEventResource("manifest.xml")
object LambdaManifestValidator : RemoteResolveParser {

    private val LOG = LoggerFactory.getLogger(LambdaManifestValidator::class.java)
    override fun canBeParsed(data: InputStream): Boolean {
        val mapper = XmlMapper().registerKotlinModule().configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false)
        val result = LOG.tryOrNull("Failed to parse Requests") {
            mapper.readValue<LambdaSampleEventManifest>(data)
        }

        return result?.requests?.isNotEmpty() ?: false
    }
}
internal data class LambdaSampleEventResource(val filename: String) : RemoteResource {
    override val urls: List<String> = listOf(
        "https://aws-vs-toolkit.s3.amazonaws.com/LambdaSampleFunctions/SampleRequests/$filename"
    )

    override val name: String = "lambda-sample-event-$filename"
    override val ttl: Duration = Duration.ofDays(7)
    override val remoteResolveParser: RemoteResolveParser? = resolveParserForGivenFile(filename.substringAfterLast('.', ""))
}
object LambdaSampleEventJsonValidator : RemoteResolveParser {
    private val LOG = LoggerFactory.getLogger(LambdaSampleEventJsonValidator::class.java)

    private val mapper = jacksonObjectMapper()
        .disable(MapperFeature.CAN_OVERRIDE_ACCESS_MODIFIERS)
        .disable(MapperFeature.ALLOW_FINAL_FIELDS_AS_MUTATORS)
        .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
        .enable(JsonParser.Feature.ALLOW_COMMENTS)

    override fun canBeParsed(data: InputStream): Boolean {
        val jsonMapper: Map<String, Any> = HashMap()
        val result = LOG.tryOrNull("Failed to parse Lambda Sample Event request") {
            this.mapper.readValue(data, jsonMapper.javaClass)
        }
        return result?.isNotEmpty() ?: false
    }
}
fun resolveParserForGivenFile(extension: String): RemoteResolveParser? =
    when (extension) {
        "xml" -> LambdaManifestValidator
        "json" -> LambdaSampleEventJsonValidator
        else -> null
    }
