// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.python

import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.openapi.roots.ProjectRootManager
import com.intellij.xdebugger.DefaultDebugProcessHandler
import com.intellij.xdebugger.XDebugProcess
import com.intellij.xdebugger.XDebugProcessStarter
import com.intellij.xdebugger.XDebugSession
import com.jetbrains.python.PythonHelper
import com.jetbrains.python.PythonLanguage
import com.jetbrains.python.console.PyDebugConsoleBuilder
import com.jetbrains.python.console.PythonDebugLanguageConsoleView
import com.jetbrains.python.debugger.PyDebugProcess
import com.jetbrains.python.debugger.PyDebugRunner
import com.jetbrains.python.sdk.PythonSdkType
import software.aws.toolkits.core.lambda.LambdaRuntime
import software.aws.toolkits.jetbrains.services.PathMapper
import software.aws.toolkits.jetbrains.services.PathMapping
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.ImageDebugSupport
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.RuntimeDebugSupport
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.SamRunningState
import software.aws.toolkits.jetbrains.utils.execution.steps.Context

class PythonRuntimeDebugSupport : RuntimeDebugSupport {
    override fun samArguments(debugPorts: List<Int>): List<String> = listOf(
        "--debugger-path",
        // Mount pydevd from PyCharm into docker
        PythonHelper.DEBUGGER.pythonPathEntry,
        "--debug-args",
        "-u $DEBUGGER_VOLUME_PATH/pydevd.py --multiprocess --port ${debugPorts.first()} --file"
    )

    override suspend fun createDebugProcess(
        context: Context,
        environment: ExecutionEnvironment,
        state: SamRunningState,
        debugHost: String,
        debugPorts: List<Int>
    ): XDebugProcessStarter = createDebugProcess(environment, state, debugHost, debugPorts)
}

abstract class PythonImageDebugSupport : ImageDebugSupport {
    override fun supportsPathMappings(): Boolean = true
    override val languageId = PythonLanguage.INSTANCE.id

    // Image debug settings are out of the SAM cli https://github.com/aws/aws-sam-cli/blob/develop/samcli/local/docker/lambda_debug_settings.py
    protected abstract val pythonPath: String
    protected abstract val bootstrapPath: String

    override suspend fun createDebugProcess(
        context: Context,
        environment: ExecutionEnvironment,
        state: SamRunningState,
        debugHost: String,
        debugPorts: List<Int>
    ): XDebugProcessStarter = createDebugProcess(environment, state, debugHost, debugPorts)

    override fun samArguments(debugPorts: List<Int>): List<String> = buildList {
        addAll(super.samArguments(debugPorts))

        val debugArgs = "$pythonPath -u $DEBUGGER_VOLUME_PATH/pydevd.py --multiprocess --port ${debugPorts.first()} --file $bootstrapPath"

        add("--debugger-path")
        // Mount pydevd from PyCharm into docker
        add(PythonHelper.DEBUGGER.pythonPathEntry)
        add("--debug-args")
        add(debugArgs)
    }
}

class Python37ImageDebugSupport : PythonImageDebugSupport() {
    override val id: String = LambdaRuntime.PYTHON3_7.toString()
    override fun displayName() = LambdaRuntime.PYTHON3_7.toString().capitalize()
    override val pythonPath: String = "/var/lang/bin/python3.7"
    override val bootstrapPath: String = "/var/runtime/bootstrap"
}

class Python38ImageDebugSupport : PythonImageDebugSupport() {
    override val id: String = LambdaRuntime.PYTHON3_8.toString()
    override fun displayName() = LambdaRuntime.PYTHON3_8.toString().capitalize()
    override val pythonPath: String = "/var/lang/bin/python3.8"
    override val bootstrapPath: String = "/var/runtime/bootstrap.py"
}

class Python39ImageDebugSupport : PythonImageDebugSupport() {
    override val id: String = LambdaRuntime.PYTHON3_9.toString()
    override fun displayName() = LambdaRuntime.PYTHON3_9.toString().capitalize()
    override val pythonPath: String = "/var/lang/bin/python3.9"
    override val bootstrapPath: String = "/var/runtime/bootstrap.py"
}

class Python310ImageDebugSupport : PythonImageDebugSupport() {
    override val id: String = LambdaRuntime.PYTHON3_10.toString()
    override fun displayName() = LambdaRuntime.PYTHON3_10.toString().capitalize()
    override val pythonPath: String = "/var/lang/bin/python3.10"
    override val bootstrapPath: String = "/var/runtime/bootstrap.py"
}

class Python311ImageDebugSupport : PythonImageDebugSupport() {
    override val id: String = LambdaRuntime.PYTHON3_11.toString()
    override fun displayName() = LambdaRuntime.PYTHON3_11.toString().capitalize()
    override val pythonPath: String = "/var/lang/bin/python3.11"
    override val bootstrapPath: String = "/var/runtime/bootstrap.py"
}

private const val DEBUGGER_VOLUME_PATH = "/tmp/lambci_debug_files"

private fun createDebugProcess(
    environment: ExecutionEnvironment,
    state: SamRunningState,
    debugHost: String,
    debugPorts: List<Int>
): XDebugProcessStarter {
    // TODO: We should allow using the module SDK, but we can't easily get the module
    val sdk = ProjectRootManager.getInstance(environment.project).projectSdk?.takeIf { it.sdkType is PythonSdkType }

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

            val console = PyDebugConsoleBuilder(environment.project, sdk).console as PythonDebugLanguageConsoleView

            val handler = DefaultDebugProcessHandler()
            return PyDebugProcess(
                session,
                console,
                handler,
                debugHost,
                debugPorts.first()
            ).also {
                it.positionConverter = PathMapper.PositionConverter(PathMapper(mappings))
                console.attachToProcess(handler)
                PyDebugRunner.initDebugConsoleView(environment.project, it, console, it.processHandler, session)
            }
        }
    }
}
