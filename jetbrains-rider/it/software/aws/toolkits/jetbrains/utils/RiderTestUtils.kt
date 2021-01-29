// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import com.intellij.execution.Output
import com.intellij.execution.configurations.RunConfiguration
import com.intellij.execution.executors.DefaultRunExecutor
import com.jetbrains.rdclient.util.idea.waitAndPump
import java.time.Duration

fun executeRunConfigurationAndWaitRider(runConfiguration: RunConfiguration, executorId: String = DefaultRunExecutor.EXECUTOR_ID): Output {
    val executeLambda = executeRunConfiguration(runConfiguration, executorId)
    // waitAndPump lets us run on EDT in the test itself without deadlocking since Rider runs tests on EDT
    // 4 is arbitrary, but Image-based functions can take > 3 min on first build/run, so 4 is a safe number
    waitAndPump(Duration.ofMinutes(4), { executeLambda.isDone })
    if (!executeLambda.isDone) {
        throw IllegalStateException("Took too long to execute Rider run configuration!")
    }
    return executeLambda.get()
}
