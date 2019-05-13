// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.lambda.nodejs

import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.xdebugger.XDebugProcessStarter
import software.aws.toolkits.jetbrains.services.lambda.execution.local.SamDebugSupport
import software.aws.toolkits.jetbrains.services.lambda.execution.local.SamRunningState

// TODO provide implementation of Node.js debugger support
class NodeJsSamDebugSupport : SamDebugSupport {
    override fun createDebugProcess(
        environment: ExecutionEnvironment,
        state: SamRunningState,
        debugPort: Int
    ): XDebugProcessStarter? = null
}
