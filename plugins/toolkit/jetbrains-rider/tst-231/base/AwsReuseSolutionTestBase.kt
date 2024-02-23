// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package base

import com.intellij.ide.GeneralSettings
import com.intellij.openapi.project.Project
import com.jetbrains.rider.projectView.solutionDirectory
import com.jetbrains.rider.test.base.BaseTestWithSolutionBase
import com.jetbrains.rider.test.debugger.XDebuggerTestHelper
import com.jetbrains.rider.test.scriptingApi.getVirtualFileFromPath
import com.jetbrains.rider.test.scriptingApi.useCachedTemplates
import org.testng.annotations.AfterClass
import org.testng.annotations.BeforeClass
import software.aws.toolkits.jetbrains.utils.OpenSolutionFileParams
import software.aws.toolkits.jetbrains.utils.openSolutionFile
import java.io.File
import java.time.Duration

/**
 * Base test class that uses the same solution per test class.
 * Solution re-open logic takes time. We can avoid this by using the same solution instance per every test in a class
 */
abstract class AwsReuseSolutionTestBase : BaseTestWithSolutionBase() {

    private var myProject: Project? = null
    var project: Project
        get() = this.myProject!!
        set(value) {
            this.myProject = value
        }

    protected open val waitForCaches: Boolean get() = false
    protected open val persistCaches: Boolean get() = false
    protected open val restoreNuGetPackages: Boolean get() = false

    protected abstract fun getSolutionDirectoryName(): String

    protected open fun getCustomSolutionFileName(): String? = null
    protected open fun preprocessTempDirectory(tempDir: File) {}

    // override is valid earlier to 232v
    override val testCaseNameToTempDir: String
        get() = getSolutionDirectoryName()

    // TODO: Remove when https://youtrack.jetbrains.com/issue/RIDER-47995 is fixed FIX_WHEN_MIN_IS_213
    @BeforeClass
    fun allowDotnetRoots() {
        allowCustomDotnetRoots()
    }

    @BeforeClass(alwaysRun = true)
    fun setUpClassSolution() {
        openSolution(getSolutionDirectoryName())
    }

    @AfterClass(alwaysRun = true)
    fun closeSolution() {
        try {
            closeSolutionAndResetSettings(myProject)
        } finally {
            myProject = null
        }
    }

    // 15 is a magic number (it's the return statement since they are all the same), but the only
    // example of it used that I could find it is used that way:
    // https://github.com/JetBrains/fsharp-support/blob/93ab17493a34a0bc0fd4c70b11adde02f81455c4/rider-fsharp/src/test/kotlin/debugger/AsyncDebuggerTest.kt#L6
    // Unlike our other projects we do not have a document to work with, so there might not be a nice way to do it.
    fun setBreakpoint(line: Int = 15) {
        // Same as com.jetbrains.rider.test.scriptingApi.toggleBreakpoint, but with the correct base directory
        XDebuggerTestHelper.toggleBreakpoint(project, getVirtualFileFromPath("src/HelloWorld/Function.cs", project.solutionDirectory), line - 1)
    }

    private fun openSolution(solutionDirName: String) {
        GeneralSettings.getInstance().isConfirmExit = false

        val params = OpenSolutionFileParams()
        params.backendLoadedTimeout = backendStartTimeout
        params.customSolutionName = getCustomSolutionFileName()
        params.preprocessTempDirectory = { preprocessTempDirectory(it) }
        params.persistCaches = persistCaches
        params.waitForCaches = waitForCaches
        params.restoreNuGetPackages = restoreNuGetPackages

        useCachedTemplates = false

        myProject = openSolution(openSolutionFile(solutionDirName), params)
    }

    override val backendShellLoadTimeout: Duration = backendStartTimeout
}
