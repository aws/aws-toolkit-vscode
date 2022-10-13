// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core

import com.intellij.testFramework.LoggedErrorProcessor

class NoopLoggedErrorProcessor : LoggedErrorProcessor() {
    override fun processWarn(category: String, message: String, t: Throwable?): Boolean = false

    override fun processError(category: String, message: String, t: Throwable?, details: Array<out String>): Boolean = false

    companion object {
        private val instance by lazy { NoopLoggedErrorProcessor() }

        fun <T> execute(f: () -> T): T {
            var ret: T? = null

            executeWith<Throwable>(instance) {
                ret = f()
            }

            // last expression should have set or thrown
            @Suppress("UnsafeCallOnNullableType")
            return ret!!
        }
    }
}
