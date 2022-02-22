// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core

import com.intellij.testFramework.LoggedErrorProcessor
import org.apache.log4j.Logger

class NoopLoggedErrorProcessor : LoggedErrorProcessor() {
    override fun processWarn(message: String?, t: Throwable?, logger: Logger) {}

    override fun processError(message: String?, t: Throwable?, details: Array<out String>?, logger: Logger) {}

    companion object {
        private val instance by lazy { NoopLoggedErrorProcessor() }

        fun <T> execute(f: () -> T): T =
            try {
                setNewInstance(instance)
                f()
            } finally {
                restoreDefaultProcessor()
            }
    }
}
