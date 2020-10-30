// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils.execution.steps

import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.info

abstract class Step {
    protected abstract val stepName: String
    protected open val hidden: Boolean = false

    fun run(context: Context, parentEmitter: MessageEmitter, ignoreCancellation: Boolean = false) {
        if (!ignoreCancellation) {
            context.throwIfCancelled()
        }

        // If we are not hidden, we will create a new factory so that the parent node is correct, else pass the current factory so in effect
        // this node does not exist in the hierarchy
        val stepEmitter = parentEmitter.createChild(stepName, hidden)

        stepEmitter.startStep()
        try {
            execute(context, stepEmitter, ignoreCancellation)

            stepEmitter.finishSuccessfully()
        } catch (e: Throwable) {
            LOG.info(e) { "Step $stepName failed" }
            stepEmitter.finishExceptionally(e)
            throw e
        }
    }

    protected abstract fun execute(context: Context, messageEmitter: MessageEmitter, ignoreCancellation: Boolean)

    private companion object {
        val LOG = getLogger<Step>()
    }
}
