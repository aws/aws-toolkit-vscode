@file:Suppress("all")
// Copyright 2000-2023 JetBrains s.r.o. and contributors. Use of this source code is governed by the Apache 2.0 license.
package com.intellij.testFramework.junit5.impl

import com.intellij.openapi.Disposable
import com.intellij.openapi.util.CheckedDisposable
import com.intellij.openapi.util.Disposer
import com.intellij.testFramework.junit5.TestDisposable
import org.jetbrains.annotations.TestOnly
import org.junit.jupiter.api.Assertions
import org.junit.jupiter.api.extension.*
import org.junit.platform.commons.util.AnnotationUtils.findAnnotatedFields
import org.junit.platform.commons.util.ReflectionUtils

/**
 * An exact copy of JetBrains' [com.intellij.testFramework.junit5.impl.TestDisposableExtension],
 * with the goal of pushing this first on the runtime classpath to resolve NoSuchMethodError from
 * the binary method signature change of [ReflectionUtils.makeAccessible] caused by JUnit 5.11.0 in
 * https://github.com/junit-team/junit5/commit/abb5ed16be3a9ce552f4a45c11264ded608ae9da
 */
@TestOnly
internal class TestDisposableExtension :
    BeforeEachCallback,
    AfterEachCallback,
    ParameterResolver {

    override fun beforeEach(context: ExtensionContext) {
        val instance = context.requiredTestInstance
        for (field in findAnnotatedFields(instance.javaClass, TestDisposable::class.java, ReflectionUtils::isNotStatic)) {
            ReflectionUtils.makeAccessible(field)[instance] = context.testDisposable()
        }
    }

    override fun afterEach(context: ExtensionContext) {
        context.testDisposableIfRequested()?.let { disposable ->
            Assertions.assertFalse(disposable.isDisposed)
            Disposer.dispose(disposable)
        }
    }

    override fun supportsParameter(parameterContext: ParameterContext, extensionContext: ExtensionContext): Boolean {
        return parameterContext.parameter.type === Disposable::class.java && parameterContext.isAnnotated(TestDisposable::class.java)
    }

    override fun resolveParameter(parameterContext: ParameterContext, extensionContext: ExtensionContext): Any {
        return extensionContext.testDisposable()
    }
}

private const val testDisposableKey = "test disposable"

private fun ExtensionContext.testDisposable(): CheckedDisposable {
    return getStore(ExtensionContext.Namespace.GLOBAL)
        .computeIfAbsent(testDisposableKey) {
            Disposer.newCheckedDisposable(uniqueId)
        }
}

private fun ExtensionContext.testDisposableIfRequested(): CheckedDisposable? {
    return getStore(ExtensionContext.Namespace.GLOBAL)
        .typedGet(testDisposableKey)
}

internal inline fun <reified T> ExtensionContext.Store.typedGet(key: String): T {
    return get(key, T::class.java)
}

fun <T> ExtensionContext.Store.computeIfAbsent(key: String, computable: () -> T): T {
    @Suppress("UNCHECKED_CAST")
    return getOrComputeIfAbsent(key) {
        computable()
    } as T
}
