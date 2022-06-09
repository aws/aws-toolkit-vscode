// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.testFramework

import com.intellij.openapi.diagnostic.Logger
import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.TestApplicationManager
import com.intellij.testFramework.TestLoggerFactory
import org.junit.jupiter.api.extension.AfterAllCallback
import org.junit.jupiter.api.extension.AfterEachCallback
import org.junit.jupiter.api.extension.BeforeAllCallback
import org.junit.jupiter.api.extension.BeforeEachCallback
import org.junit.jupiter.api.extension.ExtensionContext

// FIX_WHEN_MIN_IS_221: junit5 Extensions available in 221
// https://github.com/JetBrains/intellij-community/blob/12f2d090e59966f8395f2307182b61cf6bb66184/platform/testFramework/src/com/intellij/testFramework/FixtureRule.kt#L82
open class ApplicationExtension : BeforeAllCallback, AfterAllCallback {
    companion object {
        init {
            Logger.setFactory(TestLoggerFactory::class.java)
        }
    }

    override fun beforeAll(context: ExtensionContext) {
        TestApplicationManager.getInstance()
    }

    override fun afterAll(context: ExtensionContext) {}
}

class ProjectExtension : BeforeEachCallback, AfterEachCallback {
    private val rule by lazy { ProjectRule.createStandalone() }

    override fun beforeEach(context: ExtensionContext) {
        rule
    }

    override fun afterEach(context: ExtensionContext) {
        rule.close()
    }

    val project = rule.project
    val module = rule.module
}
