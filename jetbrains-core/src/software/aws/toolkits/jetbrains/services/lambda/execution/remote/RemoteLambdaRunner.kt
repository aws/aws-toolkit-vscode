// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.remote

import com.intellij.execution.configurations.RunProfile
import com.intellij.execution.executors.DefaultRunExecutor
import com.intellij.execution.runners.DefaultProgramRunner

class RemoteLambdaRunner : DefaultProgramRunner() {
    override fun getRunnerId(): String = "Remote AWS Lambda"

    override fun canRun(
        executorId: String,
        profile: RunProfile
    ): Boolean = DefaultRunExecutor.EXECUTOR_ID == executorId && profile is RemoteLambdaRunConfiguration
}
