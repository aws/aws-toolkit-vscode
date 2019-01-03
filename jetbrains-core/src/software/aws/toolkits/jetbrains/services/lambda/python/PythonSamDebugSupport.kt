// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.python

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.openapi.util.io.FileUtil
import com.intellij.util.AbstractPathMapper
import com.intellij.util.PathMappingSettings.PathMapping
import com.intellij.xdebugger.XDebugProcess
import com.intellij.xdebugger.XDebugProcessStarter
import com.intellij.xdebugger.XDebugSession
import com.intellij.xdebugger.XSourcePosition
import com.jetbrains.python.PythonHelper
import com.jetbrains.python.debugger.PyDebugProcess
import com.jetbrains.python.debugger.PyLocalPositionConverter
import com.jetbrains.python.debugger.PySourcePosition
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.SamDebugSupport
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.SamRunningState

class PythonSamDebugSupport : SamDebugSupport {
    override fun patchCommandLine(debugPort: Int, state: SamRunningState, commandLine: GeneralCommandLine) {
        super.patchCommandLine(debugPort, state, commandLine)

        // Note: To debug pydevd, pass '--DEBUG'
        val debugArgs = "-u $DEBUGGER_VOLUME_PATH/pydevd.py --multiprocess --port $debugPort --file"

        commandLine.withParameters("--debugger-path")
            .withParameters(PythonHelper.DEBUGGER.pythonPathEntry) // Mount pydevd from PyCharm into docker
            .withParameters("--debug-args")
            .withParameters(debugArgs)
    }

    override fun createDebugProcess(
        environment: ExecutionEnvironment,
        state: SamRunningState,
        debugPort: Int
    ): XDebugProcessStarter? = object : XDebugProcessStarter() {
        override fun start(session: XDebugSession): XDebugProcess {
            val executionResult = state.execute(environment.executor, environment.runner)
            return PyDebugProcess(
                session,
                executionResult.executionConsole,
                executionResult.processHandler,
                "localhost",
                debugPort
            ).also {
                it.positionConverter = PositionConverter()
                    .apply {
                    state.lambdaPackage.mappings.forEach { local, remote ->
                        addMapping(local, FileUtil.normalize("$TASK_PATH/$remote"))
                    }
                    addMapping(PythonHelper.DEBUGGER.pythonPathEntry,
                        DEBUGGER_VOLUME_PATH
                    )
                }
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
    internal class PositionConverter : PyLocalPositionConverter() {
        private val pathMapper =
            PathMapper()

        fun addMapping(local: String, remote: String) {
            pathMapper.addMapping(local, remote)
        }

        override fun convertToPython(filePath: String, line: Int): PySourcePosition {
            val localSource = super.convertToPython(filePath, line)
            return PyRemoteSourcePosition(pathMapper.convertToRemote(localSource.file), localSource.line)
        }

        override fun convertFromPython(position: PySourcePosition, frameName: String?): XSourcePosition? {
            val localFile = pathMapper.convertToLocal(position.file)
            return createXSourcePosition(getVirtualFile(localFile), position.line)
        }
    }

    internal class PathMapper : AbstractPathMapper() {
        private val mappings = mutableListOf<PathMapping>()

        fun addMapping(local: String, remote: String) {
            mappings.add(PathMapping(local, remote))
        }

        override fun convertToLocal(remotePath: String): String {
            val localPath = AbstractPathMapper.convertToLocal(remotePath, mappings)
            return localPath ?: remotePath
        }

        override fun convertToRemote(localPath: String): String {
            val remotePath = AbstractPathMapper.convertToRemote(localPath, mappings)
            return remotePath ?: localPath
        }

        override fun isEmpty(): Boolean = mappings.isEmpty()
        override fun getAvailablePathMappings(): MutableCollection<PathMapping> = mappings
    }
}