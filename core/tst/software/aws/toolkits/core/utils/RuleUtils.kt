// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.utils

import java.util.Random

object RuleUtils {
    fun randomName(prefix: String, length: Int = 63): String {
        val userName = System.getProperty("user.name", "unknown")
        return "${prefix.toLowerCase()}-${userName.toLowerCase()}-${Random().nextInt(10000)}".take(length)
    }

    fun prefixFromCallingClass(): String {
        val callingClass = Thread.currentThread().stackTrace[3].className
        return callingClass.substringAfterLast(".")
    }
}
