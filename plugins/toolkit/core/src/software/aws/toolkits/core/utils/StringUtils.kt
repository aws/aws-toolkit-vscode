// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.utils

/**
 * Like String.split(), but discards blank (whitespace-only) results.
 */
fun String.splitNoBlank(vararg delimiters: Char, ignoreCase: Boolean = false, limit: Int = 0): List<String> =
    split(*delimiters, ignoreCase = ignoreCase, limit = limit).filter { it.isNotBlank() }

fun ByteArray.toHexString() = joinToString("") { "%02x".format(it) }

fun String.htmlWrap() = """<html>${this.replace("\n", "<br/>")}</html>"""
