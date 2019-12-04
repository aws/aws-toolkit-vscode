// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.clouddebug.python

import com.intellij.execution.filters.TextConsoleBuilderFactory
import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.execution.ui.RunContentDescriptor
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.project.Project
import com.intellij.xdebugger.XDebugProcess
import com.intellij.xdebugger.XDebugProcessStarter
import com.intellij.xdebugger.XDebugSession
import com.intellij.xdebugger.XDebuggerManager
import com.jetbrains.python.PythonHelper
import com.jetbrains.python.debugger.PyDebugProcess
import software.aws.toolkits.jetbrains.services.PathMapper
import software.aws.toolkits.jetbrains.services.PathMapping
import software.aws.toolkits.jetbrains.services.clouddebug.CloudDebuggingPlatform
import software.aws.toolkits.jetbrains.services.clouddebug.DebuggerSupport
import software.aws.toolkits.jetbrains.services.clouddebug.execution.Context
import software.aws.toolkits.jetbrains.services.ecs.execution.ImmutableContainerOptions
import java.util.concurrent.CompletableFuture

class PythonDebuggerSupport : DebuggerSupport() {
    override val platform = CloudDebuggingPlatform.PYTHON

    // python start command. This is a regex because we can have valid start commands like python3.7 or just python
    // The space after "python" is intentional: it makes statements like "python.sh" not match
    private val pythonStartRegex = """^python((\d+\.\d+)|(\d+))?$""".toRegex()

    override val debuggerPath = object : DebuggerPath {
        override fun getDebuggerPath(): String = PythonHelper.DEBUGGER.pythonPathEntry

        override fun getDebuggerEntryPoint(): String = "${getRemoteDebuggerPath()}/pydev/pydevd.py"

        // TODO fix when cloud-debug fixes rsync to run mkdir -p
        override fun getRemoteDebuggerPath(): String =
            // "/aws/cloud-debug/debugger/$platform"
            "/aws/$platform"
    }

    override fun attachDebugger(
        context: Context,
        containerName: String,
        containerOptions: ImmutableContainerOptions,
        environment: ExecutionEnvironment,
        ports: List<Int>,
        displayName: String
    ): CompletableFuture<RunContentDescriptor?> {
        val manager = XDebuggerManager.getInstance(environment.project)
        val future = CompletableFuture<RunContentDescriptor?>()

        runInEdt {
            try {
                val descriptor = manager.startSessionAndShowTab(
                    displayName, null,
                    startDebugProcess(containerOptions, environment.project, ports.first())
                ).runContentDescriptor
                future.complete(descriptor)
            } catch (e: Exception) {
                future.completeExceptionally(e)
            }
        }

        return future
    }

    override fun automaticallyAugmentable(input: List<String>): Boolean = input.first().trim('"', '\'').substringAfterLast('/').contains(pythonStartRegex)

    override fun attachDebuggingArguments(input: List<String>, ports: List<Int>, debuggerPath: String): String =
        "${input.first()} -u $debuggerPath --multiprocess --port ${ports.first()} --file ${input.drop(1).joinToString(" ")}"

    private fun startDebugProcess(containerOptions: ImmutableContainerOptions, project: Project, port: Int) = object : XDebugProcessStarter() {
        override fun start(session: XDebugSession): XDebugProcess {
            val console = TextConsoleBuilderFactory.getInstance().createBuilder(project).console

            return PyDebugProcess(
                session,
                console,
                null,
                LOCALHOST_NAME,
                port
            ).also {
                it.positionConverter = PathMapper.PositionConverter(
                    PathMapper(
                        convertArtifactMappingsToPathMappings(
                            containerOptions.artifactMappings, debuggerPath
                        ).map { pair ->
                            PathMapping(pair.first, pair.second)
                        }
                    )
                )
            }
        }
    }
}
