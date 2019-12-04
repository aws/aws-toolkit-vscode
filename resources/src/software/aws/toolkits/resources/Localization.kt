// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

@file:JvmName("Localization")
package software.aws.toolkits.resources

import org.jetbrains.annotations.PropertyKey
import java.text.MessageFormat
import java.util.ResourceBundle

private const val BUNDLE_NAME = "software.aws.toolkits.resources.localized_messages"
private val BUNDLE by lazy {
    ResourceBundle.getBundle(BUNDLE_NAME) ?: throw RuntimeException("Cannot find resource bundle '$BUNDLE_NAME'.")
}

fun message(@PropertyKey(resourceBundle = BUNDLE_NAME) key: String, vararg params: Any): String {
    val value = BUNDLE.getString(key) ?: throw RuntimeException("Key $key not found in $BUNDLE")
    if (params.isNotEmpty() && value.contains("{")) {
        return MessageFormat.format(value, *params)
    }
    return value
}
