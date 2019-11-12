// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.python

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.xdebugger.XDebugProcess
import com.intellij.xdebugger.XDebugProcessStarter
import com.intellij.xdebugger.XDebugSession
import com.intellij.xdebugger.XSourcePosition
import com.jetbrains.python.PythonHelper
import com.jetbrains.python.debugger.PyDebugProcess
import com.jetbrains.python.debugger.PyLocalPositionConverter
import com.jetbrains.python.debugger.PySourcePosition
import software.aws.toolkits.jetbrains.services.lambda.execution.PathMapper
import software.aws.toolkits.jetbrains.services.lambda.execution.PathMapping
import software.aws.toolkits.jetbrains.services.lambda.execution.local.SamDebugSupport
import software.aws.toolkits.jetbrains.services.lambda.execution.local.SamRunningState

class PythonSamDebugSupport : SamDebugSupport {
    override fun patchCommandLine(debugPorts: List<Int>, commandLine: GeneralCommandLine) {
        super.patchCommandLine(debugPorts, commandLine)

        // Note: To debug pydevd, pass '--DEBUG'
        val debugArgs = "-u $DEBUGGER_VOLUME_PATH/pydevd.py --multiprocess --port ${debugPorts.first()} --file"

        commandLine.withParameters("--debugger-path")
            .withParameters(PythonHelper.DEBUGGER.pythonPathEntry) // Mount pydevd from PyCharm into docker
            .withParameters("--debug-args")
            .withParameters(debugArgs)
    }

    override fun createDebugProcess(
        environment: ExecutionEnvironment,
        state: SamRunningState,
        debugPorts: List<Int>
    ): XDebugProcessStarter? = object : XDebugProcessStarter() {
        override fun start(session: XDebugSession): XDebugProcess {
            val mappings = state.builtLambda.mappings.map {
                PathMapping(
                    it.localRoot,
                    "$TASK_PATH/${it.remoteRoot}"
                )
            }.toMutableList()

            mappings.add(
                PathMapping(
                    PythonHelper.DEBUGGER.pythonPathEntry,
                    DEBUGGER_VOLUME_PATH
                )
            )

            val executionResult = state.execute(environment.executor, environment.runner)
            return PyDebugProcess(
                session,
                executionResult.executionConsole,
                executionResult.processHandler,
                "localhost",
                debugPorts.first()
            ).also {
                it.positionConverter = PositionConverter(PathMapper(mappings))
            }
        }
    }

    private companion object {
        const val TASK_PATH = "/var/task"
        const val DEBUGGER_VOLUME_PATH = "/tmp/lambci_debug_files"
    }

    /**
     * Converts the IDE's view of the world into the  Docker image's view allowing for breakpoints and frames to work
     */
    internal class PositionConverter(private val pathMapper: PathMapper) : PyLocalPositionConverter() {
        override fun convertToPython(filePath: String, line: Int): PySourcePosition {
            val localSource = super.convertToPython(filePath, line)
            val remoteFile = pathMapper.convertToRemote(localSource.file) ?: localSource.file
            return PyRemoteSourcePosition(remoteFile, localSource.line)
        }

        override fun convertFromPython(position: PySourcePosition, frameName: String?): XSourcePosition? {
            val localFile = pathMapper.convertToLocal(position.file) ?: position.file
            return createXSourcePosition(getVirtualFile(localFile), position.line)
        }
    }
}
