// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils.rules

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.application.runReadAction
import com.intellij.openapi.application.runWriteAction
import com.intellij.openapi.module.Module
import com.intellij.openapi.project.Project
import com.intellij.openapi.roots.ModuleRootManager
import com.intellij.openapi.util.io.FileUtil
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.PsiFile
import com.intellij.psi.PsiManager
import com.intellij.testFramework.ApplicationRule
import com.intellij.testFramework.LightProjectDescriptor
import com.intellij.testFramework.PlatformTestUtil
import com.intellij.testFramework.common.ThreadLeakTracker
import com.intellij.testFramework.fixtures.CodeInsightTestFixture
import com.intellij.testFramework.fixtures.IdeaTestFixtureFactory
import com.intellij.testFramework.fixtures.impl.LightTempDirTestFixtureImpl
import com.intellij.testFramework.runInEdtAndGet
import com.intellij.testFramework.runInEdtAndWait
import com.intellij.testFramework.writeChild
import org.junit.runner.Description
import org.mockito.Mockito
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import java.nio.file.Paths

/**
 * JUnit test Rule that will create a Light [Project] and [CodeInsightTestFixture]. Projects are lazily created and are
 * torn down after each test.
 *
 * If you wish to have just a [Project], you may use Intellij's [com.intellij.testFramework.ProjectRule]
 */
open class CodeInsightTestFixtureRule(protected val testDescription: LightProjectDescriptor = LightProjectDescriptor.EMPTY_PROJECT_DESCRIPTOR) :
    ApplicationRule() {
    private lateinit var description: Description
    protected val lazyFixture = ClearableLazy {
        createTestFixture()
    }

    protected open fun createTestFixture(): CodeInsightTestFixture {
        val fixtureBuilder = IdeaTestFixtureFactory.getFixtureFactory().createLightFixtureBuilder(testDescription, testName)
        val newFixture = IdeaTestFixtureFactory.getFixtureFactory()
            .createCodeInsightFixture(fixtureBuilder.fixture, LightTempDirTestFixtureImpl(true))
        newFixture.setUp()
        newFixture.testDataPath = testDataPath
        return newFixture
    }

    override fun before(description: Description) {
        super.before(description)
        this.description = description
        // This timer is cancelled but it still continues running when the test is over since it cancels lazily. This is fine, so suppress the leak
        ThreadLeakTracker.longRunningThreadCreated(ApplicationManager.getApplication(), "Debugger Worker launch timer")
    }

    override fun after() {
        super.after()
        // Hack: Runs often enough that we keep our leaks down. https://github.com/mockito/mockito/pull/1619
        // TODO: Investigate Mockk and remove this
        Mockito.framework().clearInlineMocks()

        lazyFixture.ifSet {
            try {
                fixture.tearDown()
            } catch (e: Exception) {
                LOG.warn(e) { "Exception during tear-down" }
            }
            lazyFixture.clear()
        }
    }

    val project: Project
        get() = fixture.project

    val testName: String
        get() = PlatformTestUtil.getTestName(description.methodName, true)

    private val testClass: Class<*>
        get() = description.testClass

    val module: Module
        get() = fixture.module

    open val fixture: CodeInsightTestFixture
        get() = lazyFixture.value

    protected val testDataPath: String
        get() = Paths.get("testdata", testClass.simpleName, testName).toString()

    private companion object {
        val LOG = getLogger<CodeInsightTestFixtureRule>()
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

    return if (application.isDispatchThread) {
        action()
    } else {
        var ref: T? = null
        application.invokeAndWait({ ref = action() }, ModalityState.NON_MODAL)
        ref!!
    }
}

fun CodeInsightTestFixture.openFile(relativePath: String, fileText: String): VirtualFile {
    val file = this.addFileToProject(relativePath, fileText).virtualFile
    runInEdtAndWait {
        this.openFileInEditor(file)
    }

    return file
}

fun CodeInsightTestFixture.addFileToModule(
    module: Module,
    relativePath: String,
    fileText: String
): PsiFile = runInEdtAndGet {
    val file = try {
        val contentRoot = ModuleRootManager.getInstance(module).contentRoots[0]
        runWriteAction {
            contentRoot.writeChild(FileUtil.toSystemIndependentName(relativePath), fileText)
        }
    } finally {
        PsiManager.getInstance(project).dropPsiCaches()
    }

    runReadAction {
        PsiManager.getInstance(project).findFile(file)!!
    }
}
