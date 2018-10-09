// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.testutils.rules

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.module.Module
import com.intellij.openapi.project.Project
import com.intellij.testFramework.ApplicationRule
import com.intellij.testFramework.LightProjectDescriptor
import com.intellij.testFramework.PlatformTestUtil
import com.intellij.testFramework.fixtures.CodeInsightTestFixture
import com.intellij.testFramework.fixtures.IdeaTestFixtureFactory
import com.intellij.testFramework.fixtures.impl.LightTempDirTestFixtureImpl
import org.junit.rules.TestWatcher
import org.junit.runner.Description
import java.nio.file.Paths

/**
 * JUnit test Rule that will create a Light [Project] and [CodeInsightTestFixture]. Projects are lazily created and are
 * torn down after each test.
 *
 * If you wish to have just a [Project], you may use Intellij's [com.intellij.testFramework.ProjectRule]
 */
open class CodeInsightTestFixtureRule(protected val testDescription: LightProjectDescriptor = LightProjectDescriptor.EMPTY_PROJECT_DESCRIPTOR) :
    TestWatcher() {
    private lateinit var description: Description
    private val appRule = ApplicationRule()
    protected val lazyFixture = ClearableLazy {
        invokeAndWait {
            createTestFixture()
        }
    }

    protected open fun createTestFixture(): CodeInsightTestFixture {
        val fixtureBuilder = IdeaTestFixtureFactory.getFixtureFactory().createLightFixtureBuilder(testDescription)
        val newFixture = IdeaTestFixtureFactory.getFixtureFactory()
            .createCodeInsightFixture(fixtureBuilder.fixture, LightTempDirTestFixtureImpl(true))
        newFixture.setUp()
        newFixture.testDataPath = testDataPath
        return newFixture
    }

    override fun starting(description: Description) {
        appRule.before()
        this.description = description
    }

    override fun finished(description: Description?) {
        lazyFixture.ifSet {
            try {
                fixture.tearDown()
            } catch (e: Exception) {
                LOG.warn("Exception during tear-down", e)
            }
            lazyFixture.clear()
        }
    }

    val project: Project
        get() = fixture.project

    val testName: String
        get() = PlatformTestUtil.getTestName(description.methodName, true)

    val testClass: Class<*>
        get() = description.testClass

    val module: Module
        get() = fixture.module

    open val fixture: CodeInsightTestFixture
        get() = lazyFixture.value

    protected val testDataPath: String
        get() = Paths.get("testdata", testClass.simpleName, testName).toString()

    private companion object {
        val LOG = Logger.getInstance(CodeInsightTestFixtureRule::class.java)
    }
}

class ClearableLazy<out T>(private val initializer: () -> T) {
    private var _value: T? = null
    private var isSet = false

    val value: T
        get() {
            synchronized(this) {
                if (!isSet) {
                    _value = initializer()
                    isSet = true
                }
                return _value!!
            }
        }

    fun clear() {
        synchronized(this) {
            isSet = false
            _value = null
        }
    }

    fun ifSet(function: () -> Unit) {
        synchronized(this) {
            if (isSet) function()
        }
    }
}

internal fun <T> invokeAndWait(action: () -> T): T {
    val application = ApplicationManager.getApplication()

    if (application.isDispatchThread) {
        return action()
    } else {
        var ref: T? = null
        application.invokeAndWait({ ref = action() }, ModalityState.NON_MODAL)
        return ref!!
    }
}