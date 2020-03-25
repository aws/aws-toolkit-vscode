// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package base

import com.intellij.ide.GeneralSettings
import com.intellij.openapi.project.Project
import com.jetbrains.rider.test.base.BaseTestWithSolutionBase
import com.jetbrains.rider.test.scriptingApi.useCachedTemplates
import org.testng.annotations.AfterClass
import org.testng.annotations.BeforeClass
import java.io.File

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

    override val testCaseNameToTempDir: String
        get() = getSolutionDirectoryName()

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
