// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils.execution.steps

import com.intellij.openapi.progress.ProcessCanceledException
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.info

abstract class Step {
    public abstract val stepName: String
    protected open val hidden: Boolean = false

    fun run(context: Context, parentEmitter: StepEmitter, ignoreCancellation: Boolean = false) {
        if (!ignoreCancellation) {
            context.throwIfCancelled()
        }

        // If we are not hidden, we will create a new factory so that the parent node is correct, else pass the current factory so in effect
        // this node does not exist in the hierarchy
        val stepEmitter = parentEmitter.createChildEmitter(stepName, hidden)
        stepEmitter.stepStarted()
        try {
            execute(context, stepEmitter, ignoreCancellation)

            stepEmitter.stepFinishSuccessfully()
        } catch (e: SkipStepException) {
            stepEmitter.stepSkipped()
        } catch (e: Throwable) {
            LOG.info(e) { "Step $stepName failed" }
            stepEmitter.stepFinishExceptionally(e)
            throw e
        }
    }

    protected abstract fun execute(context: Context, stepEmitter: StepEmitter, ignoreCancellation: Boolean)

    /**
     * Exception used to abort out of a step and mark it as skipped. This may be used in the case that a step has to make a decision before it decides it
     * wants to run in the workflow. This differs from throwing a [ProcessCanceledException] which will terminate the workflow.
     */
    protected class SkipStepException : RuntimeException()

    private companion object {
        val LOG = getLogger<Step>()
    }
}
