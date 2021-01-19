// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.python

import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.xdebugger.XDebugProcessStarter
import com.jetbrains.python.PythonHelper
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.RuntimeDebugSupport
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.SamRunningState
import software.aws.toolkits.jetbrains.services.lambda.python.PythonDebugUtils.DEBUGGER_VOLUME_PATH

class PythonRuntimeDebugSupport : RuntimeDebugSupport {
    override fun samArguments(debugPorts: List<Int>): List<String> = listOf(
        "--debugger-path",
        // Mount pydevd from PyCharm into docker
        PythonHelper.DEBUGGER.pythonPathEntry,
        "--debug-args",
        "-u $DEBUGGER_VOLUME_PATH/pydevd.py --multiprocess --port ${debugPorts.first()} --file"
    )

    override suspend fun createDebugProcess(
        environment: ExecutionEnvironment,
        state: SamRunningState,
        debugHost: String,
        debugPorts: List<Int>
    ): XDebugProcessStarter = PythonDebugUtils.createDebugProcess(environment, state, debugHost, debugPorts)
}
