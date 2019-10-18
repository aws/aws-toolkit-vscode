// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.local

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.execution.runners.RunContentBuilder
import com.intellij.execution.ui.RunContentDescriptor
import org.jetbrains.concurrency.Promise
import org.jetbrains.concurrency.resolvedPromise

open class SamRunner {
    open fun patchCommandLine(state: SamRunningState, commandLine: GeneralCommandLine) {}

    open fun run(environment: ExecutionEnvironment, state: SamRunningState): Promise<RunContentDescriptor> {
        val executionResult = state.execute(environment.executor, environment.runner)
        return resolvedPromise(RunContentBuilder(executionResult, environment).showRunContent(environment.contentToReuse))
    }
}
