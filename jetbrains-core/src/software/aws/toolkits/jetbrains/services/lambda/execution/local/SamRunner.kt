// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.local

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.process.OSProcessHandler
import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.execution.runners.RunContentBuilder
import com.intellij.execution.ui.RunContentDescriptor
import org.jetbrains.concurrency.Promise
import org.jetbrains.concurrency.resolvedPromise
import software.aws.toolkits.resources.message

open class SamRunner {
    open fun patchCommandLine(commandLine: GeneralCommandLine) {}

    open fun run(environment: ExecutionEnvironment, state: SamRunningState): Promise<RunContentDescriptor> {
        val executionResult = state.execute(environment.executor, environment.runner)
        return resolvedPromise(RunContentBuilder(executionResult, environment).showRunContent(environment.contentToReuse))
    }

    /*
     * Assert that Docker is installed. If it is not, throw an exception.
     */
    fun checkDockerInstalled() {
        try {
            val processHandler = OSProcessHandler(GeneralCommandLine("docker", "ps"))
            processHandler.startNotify()
            processHandler.waitFor()
            val exitValue = processHandler.exitCode
            if (exitValue != 0) {
                throw Exception(message("lambda.debug.docker.not_connected"))
            }
        } catch (t: Throwable) {
            throw Exception(message("lambda.debug.docker.not_connected"), t)
        }
    }
}
