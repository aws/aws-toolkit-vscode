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
open class IndexedResource protected constructor(val type: String, val indexedProperties: Map<String, String>) {

    protected constructor(resource: Resource, indexProperties: List<String>) :
            this(
                resource.type() ?: throw RuntimeException(message("cloudformation.template_index.missing_type")),
                indexProperties
                    .asSequence()
                    .map {
                        it to try {
                            resource.getScalarProperty(it)
                        } catch (e: Exception) {
                            null
                        }
                    }
                    .mapNotNull { (key, value) -> value?.let { key to it } }
                    .toMap()
            )

    fun save(dataOutput: DataOutput) {
        dataOutput.writeUTF(type)
        dataOutput.writeInt(indexedProperties.size)
        indexedProperties.forEach { key, value ->
            dataOutput.writeUTF(key)
            dataOutput.writeUTF(value)
        }
    }

    override fun equals(other: Any?): Boolean = this === other || (other as? IndexedResource)?.indexedProperties == indexedProperties

    override fun hashCode(): Int = indexedProperties.hashCode()

    companion object {
        fun read(dataInput: DataInput): IndexedResource {
            val propertyList: MutableMap<String, String> = mutableMapOf()

            val type = dataInput.readUTF()
            val propertySize = dataInput.readInt()
            repeat(propertySize) {
                val key = dataInput.readUTF()
                val value = dataInput.readUTF()
                propertyList[key] = value
            }
            return from(type, propertyList)
        }

        fun from(type: String, indexedProperties: Map<String, String>) =
                INDEXED_RESOURCE_MAPPINGS[type]?.first?.invoke(type, indexedProperties) ?: IndexedResource(type, indexedProperties)

        fun from(resource: Resource): IndexedResource? = resource.type()?.let {
            INDEXED_RESOURCE_MAPPINGS[it]?.second?.invoke(resource) ?: IndexedResource(resource, listOf())
        }
    }
}

class IndexedFunction : IndexedResource {

    internal constructor(type: String, indexedProperties: Map<String, String>) : super(type, indexedProperties)

    internal constructor(resource: Resource) : super(resource, listOf("Runtime", "Handler"))

    fun runtime(): String? = indexedProperties["Runtime"]

    fun handler(): String? = indexedProperties["Handler"]

    override fun toString(): String = indexedProperties.toString()
}

internal val INDEXED_RESOURCE_MAPPINGS = mapOf<String, Pair<(String, Map<String, String>) -> IndexedResource, (Resource) -> IndexedResource>>(
        LAMBDA_FUNCTION_TYPE to Pair(::IndexedFunction, ::IndexedFunction),
        SERVERLESS_FUNCTION_TYPE to Pair(::IndexedFunction, ::IndexedFunction)
)
