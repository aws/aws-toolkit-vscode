// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.nodejs

import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.lang.javascript.JavascriptLanguage
import com.intellij.xdebugger.XDebugProcessStarter
import software.aws.toolkits.core.lambda.LambdaRuntime
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.ImageDebugSupport
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.SamRunningState

abstract class NodeJsImageDebugSupport : ImageDebugSupport {
    override fun supportsPathMappings(): Boolean = true
    override val languageId = JavascriptLanguage.INSTANCE.id
    override suspend fun createDebugProcess(
        environment: ExecutionEnvironment,
        state: SamRunningState,
        debugHost: String,
        debugPorts: List<Int>
    ): XDebugProcessStarter = NodeJsDebugUtils.createDebugProcess(environment, state, debugHost, debugPorts)

    override fun containerEnvVars(debugPorts: List<Int>): Map<String, String> = mapOf(
        "NODE_OPTIONS" to "--inspect-brk=0.0.0.0:${debugPorts.first()} --max-http-header-size 81920"
    )
}

class NodeJs10ImageDebug : NodeJsImageDebugSupport() {
    override val id: String = LambdaRuntime.NODEJS10_X.toString()
    override fun displayName() = LambdaRuntime.NODEJS10_X.toString().capitalize()
}

class NodeJs12ImageDebug : NodeJsImageDebugSupport() {
    override val id: String = LambdaRuntime.NODEJS12_X.toString()
    override fun displayName() = LambdaRuntime.NODEJS12_X.toString().capitalize()
}
