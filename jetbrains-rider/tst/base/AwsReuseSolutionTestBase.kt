// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package base

import com.intellij.ide.GeneralSettings
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.SystemInfo
import com.jetbrains.rider.test.base.BaseTestWithSolutionBase
import com.jetbrains.rider.test.scriptingApi.setUpCustomToolset
import com.jetbrains.rider.test.scriptingApi.setUpDotNetCoreCliPath
import com.jetbrains.rider.test.scriptingApi.useCachedTemplates
import org.testng.annotations.AfterClass
import org.testng.annotations.BeforeClass
import java.io.File

/**
 * Base test class that uses the same solution per test class.
 * Solution re-open logic takes time. We can avoid this by using the same solution instance per every test in a class
 *
 * When running with LOCAL_ENV_RUN flag set to true (for running tests outside of internal IntelliJ networks),
 * Rider will auto-detect and use Rider's bundled MSBuild that might be incompatible with full .NET framework installed
 * on Windows agent to open an empty solution. This cause the MSBuild error when loading a test project.
 *
 * To avoid such errors we need to explicitly set toolset and MSBuild to be selected on an instance.
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

    override val testCaseNameToTempDir: String
        get() = getSolutionDirectoryName()

    @BeforeClass(alwaysRun = true)
    fun setUpClassSolution() {
        openSolution(getSolutionDirectoryName())
    }

    @BeforeClass(alwaysRun = true)
    fun setUpBuildToolPath() {
        if (SystemInfo.isWindows) {
            dotnetCoreCliPath = "C:\\Program Files\\dotnet\\dotnet.exe"
            setUpDotNetCoreCliPath(dotnetCoreCliPath)
            setUpCustomToolset("C:\\Program Files\\dotnet\\sdk\\2.2.104\\MSBuild.dll")
        }
    }

    @AfterClass(alwaysRun = true)
    fun closeSolution() {
        try {
            closeSolutionAndResetSettings(myProject)
        } finally {
            myProject = null
        }
    }

    private fun openSolution(solutionDirName: String) {
        GeneralSettings.getInstance().isConfirmExit = false

        val params = OpenSolutionParams()
        params.customSolutionName = getCustomSolutionFileName()
        params.preprocessTempDirectory = { preprocessTempDirectory(it) }
        params.persistCaches = persistCaches
        params.waitForCaches = waitForCaches
        params.restoreNuGetPackages = restoreNuGetPackages

        useCachedTemplates = false

        myProject = openSolution(solutionDirName, params) { notification ->
            notificationList.add(notification)
        }
    }
}
