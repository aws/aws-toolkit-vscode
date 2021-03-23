// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.steps

import software.aws.toolkits.jetbrains.utils.execution.steps.Context
import software.aws.toolkits.jetbrains.utils.execution.steps.MessageEmitter
import software.aws.toolkits.jetbrains.utils.execution.steps.Step
import software.aws.toolkits.resources.message

class AttachDebuggerParent(private val childSteps: List<Step>) : Step() {
    override val stepName = message("sam.debug.attach")
    override val hidden = childSteps.size <= 1
    override fun execute(context: Context, messageEmitter: MessageEmitter, ignoreCancellation: Boolean) {
        childSteps.forEach {
            it.run(context, messageEmitter, ignoreCancellation)
        }
    }
}
