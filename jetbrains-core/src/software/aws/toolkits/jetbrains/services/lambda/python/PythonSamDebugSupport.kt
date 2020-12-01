// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.python

import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.xdebugger.XDebugProcess
import com.intellij.xdebugger.XDebugProcessStarter
import com.intellij.xdebugger.XDebugSession
import com.jetbrains.python.PythonHelper
import com.jetbrains.python.debugger.PyDebugProcess
import software.amazon.awssdk.services.lambda.model.PackageType
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.services.PathMapper
import software.aws.toolkits.jetbrains.services.PathMapping
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.SamDebugSupport
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.SamRunningState

class PythonSamDebugSupport : SamDebugSupport {
    override fun samArguments(runtime: Runtime, packageType: PackageType, debugPorts: List<Int>): List<String> {
        val debugArgs = if (packageType == PackageType.IMAGE) {
            // Image debug settings are out of the SAM cli https://github.com/aws/aws-sam-cli/blob/develop/samcli/local/docker/lambda_debug_settings.py
            val (python, bootstrap) = when (runtime) {
                Runtime.PYTHON2_7 -> "/usr/bin/python2.7" to "/var/runtime/awslambda/bootstrap.py"
                Runtime.PYTHON3_6 -> "/var/lang/bin/python3.6" to "/var/runtime/awslambda/bootstrap.py"
                Runtime.PYTHON3_7 -> "/var/lang/bin/python3.7" to "/var/runtime/bootstrap"
                Runtime.PYTHON3_8 -> "/var/lang/bin/python3.8" to "/var/runtime/bootstrap.py"
                else -> throw IllegalStateException("Bad runtime passed into Python samDebugArguments $runtime")
            }
            "$python -u $DEBUGGER_VOLUME_PATH/pydevd.py --multiprocess --port ${debugPorts.first()} --file $bootstrap"
        } else {
            "-u $DEBUGGER_VOLUME_PATH/pydevd.py --multiprocess --port ${debugPorts.first()} --file"
        }

        return listOf(
            "--debugger-path",
            // Mount pydevd from PyCharm into docker
            PythonHelper.DEBUGGER.pythonPathEntry,
            "--debug-args",
            debugArgs
        )
    }

    override fun createDebugProcess(
        environment: ExecutionEnvironment,
        state: SamRunningState,
        debugHost: String,
        debugPorts: List<Int>
    ): XDebugProcessStarter? = object : XDebugProcessStarter() {
        override fun start(session: XDebugSession): XDebugProcess {
            val mappings = state.builtLambda.mappings.plus(
                listOf(
                    PathMapping(
                        PythonHelper.DEBUGGER.pythonPathEntry,
                        DEBUGGER_VOLUME_PATH
                    )
                )
            )

            val executionResult = state.execute(environment.executor, environment.runner)
            return PyDebugProcess(
                session,
                executionResult.executionConsole,
                executionResult.processHandler,
                debugHost,
                debugPorts.first()
            ).also {
                it.positionConverter = PathMapper.PositionConverter(PathMapper(mappings))
            }
        }
    }

    private companion object {
        const val DEBUGGER_VOLUME_PATH = "/tmp/lambci_debug_files"
    }
}
