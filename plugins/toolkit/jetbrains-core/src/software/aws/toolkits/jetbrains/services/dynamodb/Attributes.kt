// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamodb

import software.amazon.awssdk.services.dynamodb.model.AttributeValue
import java.util.Base64

typealias SearchResults = List<Map<String, DynamoAttribute<*>>>

private const val QUOTE = '"'

/**
 * See:
 * * https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_AttributeValue.html,
 * * https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.NamingRulesDataTypes.html
 */
sealed class DynamoAttribute<T>(val value: T) {
    abstract val dataType: String

    open fun stringRepresentation() = value.toString()
}

class StringAttribute(value: String) : DynamoAttribute<String>(value) {
    override val dataType: String = "S"

    override fun stringRepresentation(): String = QUOTE + value + QUOTE
}

class BooleanAttribute(value: Boolean) : DynamoAttribute<Boolean>(value) {
    override val dataType: String = "BOOL"
}

class NumberAttribute(value: String) : DynamoAttribute<String>(value) {
    override val dataType: String = "N"
}

class BinaryAttribute(value: ByteArray) : DynamoAttribute<ByteArray>(value) {
    override val dataType: String = "B"

    override fun stringRepresentation(): String = Base64.getEncoder().encodeToString(value)
}

object NullAttribute : DynamoAttribute<Boolean>(/*Dynamo always expects the NUL field to contain true */true) {
    override val dataType: String = "NUL"

    override fun stringRepresentation(): String = "<null>"
}

class StringSetAttribute(value: List<String>) : DynamoAttribute<List<String>>(value) {
    override val dataType: String = "SS"

    override fun stringRepresentation(): String = value.joinToString(prefix = "{", postfix = "}") {
        QUOTE + it + QUOTE
    }
}

class NumberSetAttribute(value: List<String>) : DynamoAttribute<List<String>>(value) {
    override val dataType: String = "NS"

    override fun stringRepresentation(): String = value.joinToString(prefix = "{", postfix = "}")
}

class BinarySetAttribute(value: List<ByteArray>) : DynamoAttribute<List<ByteArray>>(value) {
    override val dataType: String = "BS"

    override fun stringRepresentation(): String = value.joinToString(prefix = "{", postfix = "}") {
        Base64.getEncoder().encodeToString(it)
    }
}

class MapAttribute(value: Map<String, DynamoAttribute<*>>) : DynamoAttribute<Map<String, DynamoAttribute<*>>>(value) {
    override val dataType: String = "M"

    override fun stringRepresentation(): String = value.entries.joinToString(prefix = "{", postfix = "}") {
        "$QUOTE${it.key}$QUOTE: {$QUOTE${it.value.dataType}$QUOTE: ${it.value.stringRepresentation()}}"
    }
}

class ListAttribute(value: List<DynamoAttribute<*>>) : DynamoAttribute<List<DynamoAttribute<*>>>(value) {
    override val dataType: String = "L"

    override fun stringRepresentation(): String = value.joinToString(prefix = "[", postfix = "]") {
        "{$QUOTE${it.dataType}$QUOTE: ${it.stringRepresentation()}}"
    }
}

fun AttributeValue.toAttribute(): DynamoAttribute<*> = when {
    this.s() != null -> StringAttribute(this.s())
    this.b() != null -> BinaryAttribute(this.b().asByteArray())
    this.bool() != null -> BooleanAttribute(this.bool())
    this.n() != null -> NumberAttribute(this.n())
    this.nul() != null -> NullAttribute
    this.hasSs() -> StringSetAttribute(this.ss())
    this.hasNs() -> NumberSetAttribute(this.ns())
    this.hasBs() -> BinarySetAttribute(this.bs().map { it.asByteArray() })
    this.hasM() -> MapAttribute(this.m().mapValues { it.value.toAttribute() })
    this.hasL() -> ListAttribute(this.l().map { it.toAttribute() })
    else -> throw UnsupportedOperationException(this.toString())
}
