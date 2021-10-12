// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.steps

import com.intellij.util.net.NetUtils
import software.aws.toolkits.core.utils.AttributeBagKey
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.LocalLambdaRunSettings
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.resolveDebuggerSupport
import software.aws.toolkits.jetbrains.utils.execution.steps.Context
import software.aws.toolkits.jetbrains.utils.execution.steps.Step
import software.aws.toolkits.jetbrains.utils.execution.steps.StepEmitter

class GetPorts(val settings: LocalLambdaRunSettings) : Step() {
    override val stepName: String = ""
    override val hidden: Boolean = true

    override fun execute(context: Context, messageEmitter: StepEmitter, ignoreCancellation: Boolean) {
        val debugExtension = settings.resolveDebuggerSupport()
        val debugPorts = NetUtils.findAvailableSocketPorts(debugExtension.numberOfDebugPorts()).toList()
        context.putAttribute(DEBUG_PORTS, debugPorts)
    }

    companion object {
        val DEBUG_PORTS = AttributeBagKey.create<List<Int>>("DEBUG_PORTS")
    }
}
