// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.utils

import kotlin.reflect.full.hasAnnotation
import kotlin.reflect.full.memberProperties

@Target(AnnotationTarget.PROPERTY)
annotation class SensitiveField

fun redactedString(o: Any): String {
    val clazz = o::class
    if (!clazz.isData) {
        error("Only supports redacting data classes")
    }

    return buildString {
        append(clazz.simpleName)
        append("(")

        val properties = o::class.memberProperties
        properties.forEachIndexed { i, prop ->
            append(prop.name)
            append("=")
            if (prop.hasAnnotation<SensitiveField>()) {
                if (prop.getter.call(o) == null) {
                    append("null")
                } else {
                    append("<redacted>")
                }
            } else {
                append(prop.getter.call(o))
            }

            if (i != properties.size - 1) {
                append(", ")
            }
        }

        append(")")
    }
}
