// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils.rules

import com.intellij.openapi.util.registry.Registry
import com.intellij.testFramework.ApplicationRule
import org.junit.runner.Description

/**
 * Allows a test run to have an experiment enabled, and then restore previous state
 */
class RegistryRule(private val featureId: String, private val desiredEnabledState: Boolean = true) : ApplicationRule() {

    private var originalState: Boolean = false

    override fun before(description: Description) {
        super.before(description)
        originalState = Registry.`is`(featureId)
        if (originalState != desiredEnabledState) {
            Registry.get(featureId).setValue(desiredEnabledState)
        }
    }

    fun setState(state: Boolean) {
        if (Registry.get(featureId).asBoolean() != state) {
            Registry.get(featureId).setValue(state)
        }
    }

    override fun after() {
        if (Registry.`is`(featureId) != originalState) {
            Registry.get(featureId).setValue(originalState)
        }
    }
}
