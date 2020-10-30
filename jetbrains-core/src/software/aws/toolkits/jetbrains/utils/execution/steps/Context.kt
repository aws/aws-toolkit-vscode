// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils.execution.steps

import com.intellij.openapi.progress.ProcessCanceledException
import com.intellij.openapi.project.Project
import software.aws.toolkits.core.utils.AttributeBag
import software.aws.toolkits.core.utils.AttributeBagKey
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Cross step context that exists for the life of a step workflow execution. Keeps track of the global execution state and allows passing data between steps.
 */
class Context(val project: Project) {
    val workflowToken = UUID.randomUUID().toString()
    private val attributeMap = AttributeBag()
    private val isCancelled: AtomicBoolean = AtomicBoolean(false)

    fun cancel() {
        isCancelled.set(true)
    }

    fun isCancelled() = isCancelled.get()

    fun throwIfCancelled() {
        if (isCancelled()) {
            throw ProcessCanceledException()
        }
    }

    fun <T : Any> getAttribute(key: AttributeBagKey<T>): T? = attributeMap.get(key)

    fun <T : Any> getRequiredAttribute(key: AttributeBagKey<T>): T = attributeMap.getOrThrow(key)

    fun <T : Any> putAttribute(key: AttributeBagKey<T>, data: T) {
        attributeMap.putData(key, data)
    }
}
