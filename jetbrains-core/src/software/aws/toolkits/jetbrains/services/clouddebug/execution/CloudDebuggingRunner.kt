// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.clouddebug.execution

import com.intellij.execution.configurations.RunProfile
import com.intellij.execution.configurations.RunProfileState
import com.intellij.execution.configurations.RunnerSettings
import com.intellij.execution.executors.DefaultDebugExecutor
import com.intellij.execution.runners.AsyncProgramRunner
import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.execution.runners.RunContentBuilder
import com.intellij.execution.ui.RunContentDescriptor
import org.jetbrains.concurrency.AsyncPromise
import org.jetbrains.concurrency.Promise
import software.aws.toolkits.jetbrains.services.ecs.execution.EcsCloudDebugRunConfiguration

class CloudDebuggingRunner : AsyncProgramRunner<RunnerSettings>() {
    override fun getRunnerId(): String = "CloudDebuggingRunner"

    override fun canRun(executorId: String, profile: RunProfile): Boolean {
        if (profile !is EcsCloudDebugRunConfiguration) {
            return false
        }

        if (DefaultDebugExecutor.EXECUTOR_ID == executorId) {
            // Always true so that the debug icon is shown, error is then told to user that runtime doesnt work if it doesn't
            return true
        }

        return false
    }

    override fun execute(environment: ExecutionEnvironment, state: RunProfileState): Promise<RunContentDescriptor?> {
        val runPromise = AsyncPromise<RunContentDescriptor?>()
        val runContentDescriptor = state.execute(environment.executor, this)?.let {
            RunContentBuilder(it, environment).showRunContent(environment.contentToReuse)
        }

        runPromise.setResult(runContentDescriptor)

        return runPromise
    }
}
