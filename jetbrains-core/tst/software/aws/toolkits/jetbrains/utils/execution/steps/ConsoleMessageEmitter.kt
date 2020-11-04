// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils.execution.steps

import com.intellij.util.ExceptionUtil

class ConsoleMessageEmitter(private val stepName: String) : MessageEmitter {
    override fun createChild(stepName: String, hidden: Boolean): MessageEmitter = ConsoleMessageEmitter(stepName)

    override fun startStep() {
        println("[$stepName] [Start Event]")
    }

    override fun finishSuccessfully() {
        println("[$stepName] [Finish Event] Success")
    }

    override fun finishExceptionally(e: Throwable) {
        println("[$stepName] [Finished Exceptionally] ${ExceptionUtil.getNonEmptyMessage(e, e.javaClass.simpleName)}")
    }

    override fun emitMessage(message: String, isError: Boolean) {
        println("[$stepName] $message")
    }
}
