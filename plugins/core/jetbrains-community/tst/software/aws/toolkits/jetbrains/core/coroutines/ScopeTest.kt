// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.coroutines

import com.intellij.ide.highlighter.ProjectFileType
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.ComponentManager
import com.intellij.openapi.project.ex.ProjectManagerEx
import com.intellij.openapi.util.Disposer
import com.intellij.testFramework.DisposableRule
import com.intellij.testFramework.PlatformTestUtil
import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.TestApplicationManager
import com.intellij.testFramework.createTestOpenProjectOptions
import com.intellij.testFramework.replaceService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.async
import kotlinx.coroutines.future.asCompletableFuture
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.Ignore
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.rules.TestName
import software.aws.toolkits.jetbrains.utils.isInstanceOf
import java.time.Duration
import java.util.concurrent.CancellationException
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

class ScopeTest {
    @Rule
    @JvmField
    val tempDir = TemporaryFolder()

    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @Rule
    @JvmField
    val disposableRule = DisposableRule()

    @Rule
    @JvmField
    val testName = TestName()

    @Test
    fun `plugin being uploaded cancels application scope`() {
        val fakePluginScope = createFakePluginScope()

        assertScopeIsCanceled(applicationCoroutineScope()) {
            Disposer.dispose(fakePluginScope)
        }
    }

    @Test
    fun `plugin being uploaded cancels project scope`() {
        val fakePluginScope = createFakePluginScope(projectRule.project)

        assertScopeIsCanceled(projectCoroutineScope(projectRule.project)) {
            Disposer.dispose(fakePluginScope)
        }
    }

    @Test
    fun `plugin being uploaded cancels disposable scope`() {
        val fakePluginScope = createFakePluginScope()

        // Use fake disposable so we dont accidentally trigger false positive, nor disposable leak detector
        val fakeDisposable = Disposable { }
        assertScopeIsCanceled(disposableCoroutineScope(fakeDisposable)) {
            Disposer.dispose(fakePluginScope)
        }
    }

    @Test
    @Ignore("Disposing the application leads to the AppExecutorUtil.getAppExecutorService being shutdown and no way to restart and thus fails all future tests")
    fun `application being disposed cancels application scope`() {
        assertScopeIsCanceled(applicationCoroutineScope()) {
            TestApplicationManager.getInstance().dispose()
        }
    }

    @Test
    fun `project being disposed cancels project scope`() {
        val projectFile = tempDir.newFile("${testName.methodName}${ProjectFileType.DOT_DEFAULT_EXTENSION}").toPath()
        val options = createTestOpenProjectOptions(runPostStartUpActivities = false)
        val project = ProjectManagerEx.getInstanceEx().openProject(projectFile, options)!!

        assertScopeIsCanceled(projectCoroutineScope(project)) {
            PlatformTestUtil.forceCloseProjectWithoutSaving(project)
        }
    }

    @Test
    fun `disposable being disposed cancels disposable scope`() {
        val disposable = Disposer.newDisposable()

        assertScopeIsCanceled(disposableCoroutineScope(disposable)) {
            Disposer.dispose(disposable)
        }
    }

    @Test
    fun `applicationCoroutineScope launches on background thread`() {
        assertScopeIsCorrectThread(applicationCoroutineScope())
    }

    @Test
    fun `projectCoroutineScope launches on background thread`() {
        assertScopeIsCorrectThread(projectCoroutineScope(projectRule.project))
    }

    @Test
    fun `disposableCoroutineScope launches on background thread`() {
        assertScopeIsCorrectThread(disposableCoroutineScope(disposableRule.disposable))
    }

    @Test
    fun `application and project trackers are different`() {
        val projectFile = tempDir.newFile("${testName.methodName}${ProjectFileType.DOT_DEFAULT_EXTENSION}").toPath()
        val options = createTestOpenProjectOptions(runPostStartUpActivities = false)
        val project2 = ProjectManagerEx.getInstanceEx().openProject(projectFile, options)!!

        try {
            assertThat(
                listOf(
                    PluginCoroutineScopeTracker.getInstance(),
                    PluginCoroutineScopeTracker.getInstance(projectRule.project),
                    PluginCoroutineScopeTracker.getInstance(project2)
                )
            ).doesNotHaveDuplicates()
        } finally {
            PlatformTestUtil.forceCloseProjectWithoutSaving(project2)
        }
    }

    @Test
    fun `disposableCoroutineScope can't take a project`() {
        assertThatThrownBy { disposableCoroutineScope(projectRule.project) }.isInstanceOf<IllegalStateException>()
    }

    @Test
    fun `disposableCoroutineScope can't take an application`() {
        assertThatThrownBy { disposableCoroutineScope(ApplicationManager.getApplication()) }.isInstanceOf<IllegalStateException>()
    }

    private fun createFakePluginScope(componentManager: ComponentManager = ApplicationManager.getApplication()): Disposable {
        // We can't unload the real plugin in tests, so make another instance of the service and replace it for the tests
        val tracker = PluginCoroutineScopeTracker()
        componentManager.replaceService(PluginCoroutineScopeTracker::class.java, tracker, disposableRule.disposable)
        return tracker
    }

    private fun assertScopeIsCorrectThread(scope: CoroutineScope) {
        val ran = AtomicBoolean(false)
        runBlocking(scope.coroutineContext) {
            assertThat(ApplicationManager.getApplication().isDispatchThread).isFalse
            ran.set(true)
        }
        assertThat(ran).isTrue
    }

    private fun assertScopeIsCanceled(scope: CoroutineScope, cancellationTask: () -> Unit) {
        val testTarget = TestTarget(scope)
        val future = testTarget.computeAsync().asCompletableFuture()
        assertThat(testTarget.computationStarted.await(10, TimeUnit.SECONDS)).isTrue

        cancellationTask()

        testTarget.cancelFired.countDown()

        assertThat(future).failsWithin(Duration.ofSeconds(10)).withThrowableOfType(CancellationException::class.java)
        assertThat(testTarget.bgTaskDone.get()).isFalse
    }

    @Suppress("BlockingMethodInNonBlockingContext")
    private class TestTarget(private val scope: CoroutineScope) {
        val computationStarted = CountDownLatch(1)
        val cancelFired = CountDownLatch(1)
        val bgTaskDone = AtomicBoolean(false)

        fun computeAsync() = scope.async {
            computationStarted.countDown()
            cancelFired.await()
            doTask()
        }

        suspend fun doTask() = withContext(getCoroutineBgContext()) {
            bgTaskDone.set(true)
        }
    }
}
