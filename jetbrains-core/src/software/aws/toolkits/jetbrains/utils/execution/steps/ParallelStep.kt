// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils.execution.steps

import com.intellij.openapi.application.ApplicationManager
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CompletionException

/**
 * [Step] that creates multiple child steps and runs them in parallel waiting on the result.
 *
 * It can optionally hide itself from the tree. If hidden, it acts as just a logical parent.
 * If shown, it shows itself as a parent node in the tree to its children.
 */
abstract class ParallelStep : Step() {
    private inner class ChildStep(val future: CompletableFuture<*>)

    private val listOfChildTasks = mutableListOf<ChildStep>()

    override val hidden = true

    protected abstract fun buildChildSteps(context: Context): List<Step>

    final override fun execute(
        context: Context,
        messageEmitter: StepEmitter,
        ignoreCancellation: Boolean
    ) {
        buildChildSteps(context).forEach {
            val stepFuture = CompletableFuture<Unit>()
            listOfChildTasks.add(ChildStep(stepFuture))

            ApplicationManager.getApplication().executeOnPooledThread {
                try {
                    it.run(context, messageEmitter, ignoreCancellation)
                    stepFuture.complete(null)
                } catch (e: Throwable) {
                    stepFuture.completeExceptionally(e)
                }
            }
        }

        try {
            CompletableFuture.allOf(*listOfChildTasks.map { it.future }.toTypedArray()).join()
        } catch (e: CompletionException) {
            throw e.cause ?: e
        }
    }
}
