// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonq.commands

import com.fasterxml.jackson.annotation.JsonAutoDetect
import com.fasterxml.jackson.annotation.JsonInclude
import com.fasterxml.jackson.annotation.PropertyAccessor
import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.MapperFeature
import com.fasterxml.jackson.databind.SerializationFeature
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import org.jetbrains.annotations.VisibleForTesting
import software.aws.toolkits.jetbrains.services.amazonq.messages.AmazonQMessage
import software.aws.toolkits.jetbrains.services.amazonq.messages.UnknownMessageType
import software.aws.toolkits.jetbrains.services.amazonq.util.command

class MessageSerializer @VisibleForTesting constructor() {

    private val objectMapper = jacksonObjectMapper()
        .registerModule(JavaTimeModule())
        .enable(MapperFeature.ACCEPT_CASE_INSENSITIVE_ENUMS)
        .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
        .setVisibility(PropertyAccessor.FIELD, JsonAutoDetect.Visibility.ANY)
        .setSerializationInclusion(JsonInclude.Include.NON_NULL)
        .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false)

    fun toNode(json: String) = objectMapper.readTree(json)

    fun deserialize(node: JsonNode, registeredTypes: MessageTypeRegistry): AmazonQMessage {
        val type = registeredTypes.get(node.command) ?: return UnknownMessageType(node.asText())
        return objectMapper.treeToValue(node, type.java)
    }

    fun serialize(value: Any): String = objectMapper.writeValueAsString(value)

    // Provide singleton global access
    companion object {
        private val instance = MessageSerializer()

        fun getInstance() = instance
    }
}
