// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package base

import com.intellij.openapi.util.SystemInfo
import com.jetbrains.rider.test.base.BaseTestWithMarkup
import com.jetbrains.rider.test.base.PrepareTestEnvironment
import com.jetbrains.rider.test.scriptingApi.setUpCustomToolset
import com.jetbrains.rider.test.scriptingApi.setUpDotNetCoreCliPath
import org.testng.annotations.BeforeClass

// BaseTestWithMarkup inherit the logic in EditorTestBase class that prepare test project that create
// an empty solution and adds project under test to this solution.
//
// When running with LOCAL_ENV_RUN flag set to true (for running tests outside of internal IntelliJ networks),
// Rider will auto-detect and use Rider's bundled MSBuild that might be incompatible with full .NET framework installed
// on Windows agent to open an empty solution. This cause the MSBuild error when loading a test project.
//
// To avoid such errors we need to explicitly set toolset and MSBuild to be selected on an instance.
// Please use this class for any Highlighting tests
open class AwsMarkupBaseTest : BaseTestWithMarkup() {
    @BeforeClass
    fun setUpBuildToolPath() {
        if (SystemInfo.isWindows) {
            PrepareTestEnvironment.dotnetCoreCliPath = "C:\\Program Files\\dotnet\\dotnet.exe"
            setUpDotNetCoreCliPath(PrepareTestEnvironment.dotnetCoreCliPath)
            setUpCustomToolset(msBuild)
        }
    }
}
