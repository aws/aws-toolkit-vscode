// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.python

import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.openapi.roots.ProjectRootManager
import com.intellij.xdebugger.XDebugProcess
import com.intellij.xdebugger.XDebugProcessStarter
import com.intellij.xdebugger.XDebugSession
import com.jetbrains.python.PythonHelper
import com.jetbrains.python.console.PyDebugConsoleBuilder
import com.jetbrains.python.debugger.PyDebugProcess
import com.jetbrains.python.debugger.PyDebugRunner
import com.jetbrains.python.sdk.PythonSdkType
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import software.aws.toolkits.jetbrains.services.PathMapper
import software.aws.toolkits.jetbrains.services.PathMapping
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.SamRunningState

object PythonDebugUtils {
    const val DEBUGGER_VOLUME_PATH = "/tmp/lambci_debug_files"

    suspend fun createDebugProcess(
        environment: ExecutionEnvironment,
        state: SamRunningState,
        debugHost: String,
        debugPorts: List<Int>
    ): XDebugProcessStarter {
        // TODO: We should allow using the module SDK, but we can't easily get the module
        val sdk = ProjectRootManager.getInstance(environment.project).projectSdk?.takeIf { it.sdkType is PythonSdkType }
        state.consoleBuilder = PyDebugConsoleBuilder(environment.project, sdk)

        val executionResult = withContext(Dispatchers.IO) {
            // needs to run off EDT since it resolves credentials
            state.execute(environment.executor, environment.runner)
        }

        return object : XDebugProcessStarter() {
            override fun start(session: XDebugSession): XDebugProcess {

                val mappings = state.pathMappings.plus(
                    listOf(
                        PathMapping(
                            PythonHelper.DEBUGGER.pythonPathEntry,
                            DEBUGGER_VOLUME_PATH
                        )
                    )
                )

                return PyDebugProcess(
                    session,
                    executionResult.executionConsole,
                    executionResult.processHandler,
                    debugHost,
                    debugPorts.first()
                ).also {
                    it.positionConverter = PathMapper.PositionConverter(PathMapper(mappings))

                    PyDebugRunner.createConsoleCommunicationAndSetupActions(environment.project, executionResult, it, session)
                }
            }
        }
    }
}
