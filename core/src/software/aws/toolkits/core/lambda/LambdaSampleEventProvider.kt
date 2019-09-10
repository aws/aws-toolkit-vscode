// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.lambda

import com.fasterxml.jackson.annotation.JsonProperty
import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.dataformat.xml.XmlMapper
import com.fasterxml.jackson.dataformat.xml.annotation.JacksonXmlElementWrapper
import com.fasterxml.jackson.module.kotlin.readValue
import com.fasterxml.jackson.module.kotlin.registerKotlinModule
import software.aws.toolkits.core.utils.RemoteResource
import software.aws.toolkits.core.utils.RemoteResourceResolver
import software.aws.toolkits.core.utils.inputStream
import software.aws.toolkits.core.utils.readText
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
            return resourceResolver.resolve(LambdaSampleEventManifestResource).thenApply {
                val resolved = mapper.readValue<LambdaSampleEventManifest>(it.inputStream()).requests.map {
                    LambdaSampleEvent(it.name) { resourceResolver.resolve(LambdaSampleEventResource(it.filename)).thenApply { it?.readText() } }
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

private data class LambdaSampleEventManifest(
    @JsonProperty(value = "request")
    @JacksonXmlElementWrapper(useWrapping = false)
    val requests: List<LambdaSampleEventRequest>
)

private data class LambdaSampleEventRequest(
    val filename: String,
    val name: String
)

internal val LambdaSampleEventManifestResource = LambdaSampleEventResource("manifest.xml")

internal data class LambdaSampleEventResource(val filename: String) : RemoteResource {
    override val urls: List<String> = listOf(
        "http://vstoolkit.amazonwebservices.com/LambdaSampleFunctions/SampleRequests/$filename",
        "https://s3.amazonaws.com/aws-vs-toolkit/LambdaSampleFunctions/SampleRequests/$filename"
    )

    override val name: String = "lambda-sample-event-$filename"
    override val ttl: Duration = Duration.ofDays(7)
}
