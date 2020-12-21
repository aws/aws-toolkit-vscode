// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils.rules

import com.intellij.testFramework.ApplicationRule
import org.junit.rules.TestWatcher
import org.junit.runner.Description

// TODO: Delete this and move back child classes to have ApplicationRule as the parent FIX_WHEN_MIN_IS_202
open class AppRule : TestWatcher() {
    private val appRule = ApplicationRule()

    override fun starting(description: Description) {
        val beforeMethod = appRule.javaClass.declaredMethods.first { it.name == "before" }
        beforeMethod.trySetAccessible()
        if (beforeMethod.parameterCount == 1) {
            beforeMethod.invoke(appRule, description)
        } else {
            beforeMethod.invoke(appRule)
        }
    }
}
