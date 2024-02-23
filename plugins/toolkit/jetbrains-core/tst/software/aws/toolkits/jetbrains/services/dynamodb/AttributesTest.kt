// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamodb

import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.Test
import org.junit.experimental.runners.Enclosed
import org.junit.runner.RunWith
import org.junit.runners.Parameterized
import software.amazon.awssdk.core.SdkBytes
import software.amazon.awssdk.services.dynamodb.model.AttributeValue
import kotlin.reflect.KClass

@RunWith(Enclosed::class)
class AttributesTest {
    @RunWith(Parameterized::class)
    class ParameterizedTests(
        private val dataType: String,
        private val attributeValue: AttributeValue,
        private val attributeType: KClass<out DynamoAttribute<*>>,
        private val strFormat: String
    ) {
        companion object {
            @JvmStatic
            @Parameterized.Parameters(name = "{0}")
            fun data() = arrayOf(
                arrayOf(
                    "BOOL",
                    AttributeValue.builder().bool(true).build(),
                    BooleanAttribute::class,
                    "true"
                ),
                arrayOf(
                    "S",
                    AttributeValue.builder().s("hello").build(),
                    StringAttribute::class,
                    "\"hello\""
                ),
                arrayOf(
                    "N",
                    AttributeValue.builder().n("1.2").build(),
                    NumberAttribute::class,
                    "1.2"
                ),
                arrayOf(
                    "B",
                    AttributeValue.builder().b(SdkBytes.fromUtf8String("hi")).build(),
                    BinaryAttribute::class,
                    "aGk="
                ),
                arrayOf(
                    "NUL",
                    AttributeValue.builder().nul(true).build(),
                    NullAttribute::class,
                    "<null>"
                ),
                arrayOf(
                    "SS",
                    AttributeValue.builder().ss("hello", "\"bob\"").build(),
                    StringSetAttribute::class,
                    "{\"hello\", \"\"bob\"\"}"
                ),
                arrayOf(
                    "NS",
                    AttributeValue.builder().ns("1", "2").build(),
                    NumberSetAttribute::class,
                    "{1, 2}"
                ),
                arrayOf(
                    "BS",
                    AttributeValue.builder().bs(SdkBytes.fromUtf8String("hi"), SdkBytes.fromUtf8String("bye")).build(),
                    BinarySetAttribute::class,
                    "{aGk=, Ynll}"
                ),
                arrayOf(
                    "M",
                    AttributeValue.builder().m(mapOf("foo" to AttributeValue.builder().bool(false).build())).build(),
                    MapAttribute::class,
                    "{\"foo\": {\"BOOL\": false}}"
                ),
                arrayOf(
                    "L",
                    AttributeValue.builder().l(AttributeValue.builder().s("hi").build(), AttributeValue.builder().n("1").build()).build(),
                    ListAttribute::class,
                    "[{\"S\": \"hi\"}, {\"N\": 1}]"
                )
            )
        }

        @Test
        fun `correct attribute type`() {
            assertThat(attributeValue.toAttribute()).isInstanceOf(attributeType.java)
        }

        @Test
        fun `string representation`() {
            assertThat(attributeValue.toAttribute().stringRepresentation()).isEqualTo(strFormat)
        }

        @Test
        fun `correct type string`() {
            assertThat(attributeValue.toAttribute().dataType).isEqualTo(dataType)
        }
    }

    @Test
    fun `unknown attribute value throws`() {
        assertThatThrownBy {
            AttributeValue.builder().build().toAttribute()
        }.isInstanceOf(UnsupportedOperationException::class.java)
    }
}
