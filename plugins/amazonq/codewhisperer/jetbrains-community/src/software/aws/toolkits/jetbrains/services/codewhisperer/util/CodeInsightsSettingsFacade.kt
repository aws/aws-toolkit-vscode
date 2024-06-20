// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.util

import com.intellij.codeInsight.CodeInsightSettings
import com.intellij.openapi.Disposable
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.util.SimpleModificationTracker
import org.jetbrains.annotations.VisibleForTesting
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger
import kotlin.reflect.KMutableProperty

class CodeInsightsSettingsFacade : SimpleModificationTracker(), Disposable {
    private inner class ChangeAndRevert<T : Any>(
        val p: KMutableProperty<T>,
        val value: T,
        parentDisposable: Disposable
    ) {
        val origin: T = p.getter.call()
        var isComplete: Boolean = false
            private set

        init {
            Disposer.register(parentDisposable) {
                revert()
            }
        }

        fun commit(): ChangeAndRevert<T> {
            p.setter.call(value)
            return this
        }

        fun revert() {
            if (isComplete) {
                return
            }

            p.setter.call(origin)
            isComplete = true
        }
    }

    private val settings by lazy {
        CodeInsightSettings.getInstance()
    }

    private var pendingReverts = listOf<ChangeAndRevert<*>>()
    val pendingRevertCounts: Int
        get() = pendingReverts.size

    @VisibleForTesting
    internal fun revertAll() {
        if (pendingReverts.count { !it.isComplete } == 0) {
            return
        }

        pendingReverts.forEach {
            it.revert()
        }

        pendingReverts = pendingReverts.filter {
            !it.isComplete
        }.toMutableList()
    }

    fun disableCodeInsightUntil(parentDisposable: Disposable) {
        revertAll()
        val toReverts = mutableListOf<ChangeAndRevert<*>>()

        ChangeAndRevert(settings::TAB_EXITS_BRACKETS_AND_QUOTES, false, parentDisposable).commit().also {
            toReverts.add(it)
        }

        ChangeAndRevert(settings::AUTO_POPUP_COMPLETION_LOOKUP, false, parentDisposable).commit().also {
            toReverts.add(it)
        }

        if (pendingReverts.count { !it.isComplete } != 0) {
            LOG.error { "trying to overwrite users' settings without reverting all previous overwrites" }
        }
        pendingReverts = toReverts

        Disposer.register(parentDisposable) {
            revertAll()
        }
    }

    override fun dispose() {
        revertAll()
    }

    companion object {
        val LOG = getLogger<CodeInsightsSettingsFacade>()
    }
}
