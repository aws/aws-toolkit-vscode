// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

class YamlWriter internal constructor() {
    private val stringBuilder = StringBuilder()
    private var indentLevel = 0

    fun mapping(key: String, block: YamlWriter.() -> Unit) {
        appendIndent().append("$key:").append('\n')
        indentLevel++

        block()

        indentLevel--
    }

    fun keyValue(key: String, value: String) {
        appendIndent().append("$key: $value\n")
    }

    private fun appendIndent() = stringBuilder.append("  ".repeat(indentLevel))

    override fun toString() = stringBuilder.toString().trimEnd()
}

fun yamlWriter(init: YamlWriter.() -> Unit): String {
    val yaml = YamlWriter()
    yaml.init()
    return yaml.toString()
}
