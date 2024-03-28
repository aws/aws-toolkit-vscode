// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils.rules

import com.intellij.testFramework.DisposableRule
import org.junit.rules.ExternalResource
import org.junit.runner.Description
import org.junit.runners.model.Statement
import software.aws.toolkits.jetbrains.core.MockClientManager
import software.aws.toolkits.jetbrains.core.credentials.sso.MockSsoLoginCallbackProvider
import software.aws.toolkits.jetbrains.core.credentials.sso.NoOpSsoLoginCallback
import software.aws.toolkits.jetbrains.core.credentials.sso.SsoLoginCallback
import software.aws.toolkits.jetbrains.core.credentials.sso.TestSsoPrompt
import software.aws.toolkits.jetbrains.utils.extensions.SsoLogin

class SsoLoginRule : DisposableRule() {
    override fun apply(base: Statement, description: Description): Statement {
        val annotation = description.getAnnotation(SsoLogin::class.java) ?: description.testClass.getAnnotation(SsoLogin::class.java)
        return if (annotation == null) {
            base
        } else {
            object : Statement() {
                override fun evaluate() {
                    try {
                        MockClientManager.useRealImplementations(disposable)
                        MockSsoLoginCallbackProvider.getInstance().provider = TestSsoPrompt(annotation.secretName)

                        base.evaluate()
                    } finally {
                        MockSsoLoginCallbackProvider.getInstance().provider = null
                    }
                }
            }
        }
    }
}

class SsoLoginCallbackProviderRule : ExternalResource() {
    override fun before() {
        setCallback(NoOpSsoLoginCallback)
    }

    fun setCallback(callback: SsoLoginCallback?) {
        MockSsoLoginCallbackProvider.getInstance().provider = callback
    }

    override fun after() {
        setCallback(null)
    }
}
