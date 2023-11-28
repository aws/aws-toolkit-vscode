// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonq.commands

import software.aws.toolkits.jetbrains.services.amazonq.messages.AmazonQMessage
import kotlin.reflect.KClass

private typealias MessageClass = KClass<out AmazonQMessage>

/**
 * This class allows an App to register the target class to use for deserialization of a particular command from the TypeScript code.
 * Messages from TypeScript arrive as a JSON object that always has a "command" field. Apps can register the specific class an object with a particular command
 * should deserialize as before they are sent out to the app's MessageListener.
 */
class MessageTypeRegistry {
    private val registry = mutableMapOf<String, MessageClass>()

    fun register(command: String, type: MessageClass) = registry.put(command, type)
    fun register(vararg entries: Pair<String, MessageClass>) = registry.putAll(entries)

    fun remove(command: String) = registry.remove(command)
    fun get(command: String) = registry[command]
}
