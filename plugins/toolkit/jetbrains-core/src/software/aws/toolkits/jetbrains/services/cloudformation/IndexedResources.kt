// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudformation

import software.aws.toolkits.jetbrains.services.cloudformation.IndexedResource.Companion.from
import software.aws.toolkits.resources.message
import java.io.DataInput
import java.io.DataOutput

/**
 * Immutable data class for indexing [Resource]. Use [from] to create an instance so that it always
 * returns a concrete [IndexedResource] such as [IndexedFunction] if applicable.
 */
open class IndexedResource protected constructor(val type: String, val indexedProperties: Map<String, String>, val indexedMetadata: Map<String, String>) {

    protected constructor(resource: Resource, indexProperties: List<String>, indexMetadata: List<String>) :
        this(
            resource.type() ?: throw RuntimeException(message("cloudformation.template_index.missing_type")),
            indexProperties.mapScalars(resource, Resource::getScalarProperty),
            indexMetadata.mapScalars(resource, Resource::getScalarMetadata)
        )

    fun save(dataOutput: DataOutput) {
        dataOutput.writeUTF(type)
        dataOutput.writeInt(indexedProperties.size)
        indexedProperties.forEach { (key, value) ->
            dataOutput.writeUTF(key)
            dataOutput.writeUTF(value)
        }
        dataOutput.writeInt(indexedMetadata.size)
        indexedMetadata.forEach { (key, value) ->
            dataOutput.writeUTF(key)
            dataOutput.writeUTF(value)
        }
    }

    override fun equals(other: Any?): Boolean = this === other || (other as? IndexedResource)?.indexedProperties == indexedProperties

    override fun hashCode(): Int = indexedProperties.hashCode()

    companion object {
        private fun List<String>.mapScalars(resource: Resource, fn: Resource.(property: String) -> String): Map<String, String> =
            this
                .asSequence()
                .map {
                    it to try {
                        resource.fn(it)
                    } catch (e: Exception) {
                        null
                    }
                }
                .mapNotNull { (key, value) -> value?.let { key to it } }
                .toMap()

        fun read(dataInput: DataInput): IndexedResource {
            val propertyList: MutableMap<String, String> = mutableMapOf()
            val metadataList: MutableMap<String, String> = mutableMapOf()

            val type = dataInput.readUTF()
            val propertySize = dataInput.readInt()
            repeat(propertySize) {
                val key = dataInput.readUTF()
                val value = dataInput.readUTF()
                propertyList[key] = value
            }
            val metadataSize = dataInput.readInt()
            repeat(metadataSize) {
                val key = dataInput.readUTF()
                val value = dataInput.readUTF()
                metadataList[key] = value
            }
            return from(type, propertyList, metadataList)
        }

        fun from(type: String, indexedProperties: Map<String, String>, indexedMetadata: Map<String, String>) =
            INDEXED_RESOURCE_MAPPINGS[type]?.first?.invoke(type, indexedProperties, indexedMetadata)
                ?: IndexedResource(type, indexedProperties, indexedMetadata)

        fun from(resource: Resource): IndexedResource? = resource.type()?.let {
            INDEXED_RESOURCE_MAPPINGS[it]?.second?.invoke(resource) ?: IndexedResource(resource, listOf(), listOf())
        }
    }
}

class IndexedFunction : IndexedResource {

    internal constructor(type: String, indexedProperties: Map<String, String>, indexedMetadata: Map<String, String>) :
        super(type, indexedProperties, indexedMetadata)

    internal constructor(resource: Resource) : super(resource, listOf("Runtime", "Handler", "PackageType"), listOf("BuildMethod"))

    fun runtime(): String? = indexedProperties["Runtime"]

    fun handler(): String? = indexedProperties["Handler"]

    fun packageType(): String? = indexedProperties["PackageType"]

    fun buildMethod(): String? = indexedMetadata["BuildMethod"]

    override fun toString(): String = "IndexedFunction(indexedProperties=$indexedProperties,indexedMetadata=$indexedMetadata)"
}

internal val INDEXED_RESOURCE_MAPPINGS = mapOf<
    String,
    Pair<
        (String, Map<String, String>, Map<String, String>) -> IndexedResource,
        (Resource) -> IndexedResource
        >
    >(
    LAMBDA_FUNCTION_TYPE to Pair(::IndexedFunction, ::IndexedFunction),
    SERVERLESS_FUNCTION_TYPE to Pair(::IndexedFunction, ::IndexedFunction)
)
