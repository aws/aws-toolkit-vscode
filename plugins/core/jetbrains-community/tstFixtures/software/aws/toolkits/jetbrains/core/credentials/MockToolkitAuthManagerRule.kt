// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.testFramework.ApplicationRule
import software.aws.toolkits.jetbrains.utils.rules.ClearableLazy

class MockToolkitAuthManagerRule : ApplicationRule() {
    private val lazyAuthManager = ClearableLazy {
        ToolkitAuthManager.getInstance()
    }

    private val authManager
        get() = lazyAuthManager.value

    override fun after() {
        lazyAuthManager.ifSet {
            reset()
            lazyAuthManager.clear()
        }
    }

    fun reset() {
        authManager.listConnections().forEach {
            authManager.deleteConnection(it)
        }
    }

    fun createConnection(profile: AuthProfile) = authManager.createConnection(profile)
}
