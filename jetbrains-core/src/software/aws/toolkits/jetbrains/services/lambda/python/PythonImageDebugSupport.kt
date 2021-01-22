// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.python

import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.xdebugger.XDebugProcessStarter
import com.jetbrains.python.PythonHelper
import com.jetbrains.python.PythonLanguage
import software.aws.toolkits.core.lambda.LambdaRuntime
import software.aws.toolkits.jetbrains.core.utils.buildList
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.ImageDebugSupport
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.SamRunningState
import software.aws.toolkits.jetbrains.services.lambda.python.PythonDebugUtils.DEBUGGER_VOLUME_PATH

abstract class PythonImageDebugSupport : ImageDebugSupport {
    override fun supportsPathMappings(): Boolean = true
    override val languageId = PythonLanguage.INSTANCE.id

    // Image debug settings are out of the SAM cli https://github.com/aws/aws-sam-cli/blob/develop/samcli/local/docker/lambda_debug_settings.py
    protected abstract val pythonPath: String
    protected abstract val bootstrapPath: String

    override suspend fun createDebugProcess(
        environment: ExecutionEnvironment,
        state: SamRunningState,
        debugHost: String,
        debugPorts: List<Int>
    ): XDebugProcessStarter? = PythonDebugUtils.createDebugProcess(environment, state, debugHost, debugPorts)

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

class Python27ImageDebugSupport : PythonImageDebugSupport() {
    override val id: String = LambdaRuntime.PYTHON2_7.toString()
    override fun displayName() = LambdaRuntime.PYTHON2_7.toString().capitalize()
    override val pythonPath: String = "/usr/bin/python2.7"
    override val bootstrapPath: String = "/var/runtime/awslambda/bootstrap.py"
}

class Python36ImageDebugSupport : PythonImageDebugSupport() {
    override val id: String = LambdaRuntime.PYTHON3_6.toString()
    override fun displayName() = LambdaRuntime.PYTHON3_6.toString().capitalize()
    override val pythonPath: String = "/var/lang/bin/python3.6"
    override val bootstrapPath: String = "/var/runtime/awslambda/bootstrap.py"
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
