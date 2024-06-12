// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.utils

import com.intellij.openapi.projectRoots.JavaSdkVersion
import com.intellij.openapi.projectRoots.Sdk
import com.intellij.openapi.roots.LanguageLevelProjectExtension
import com.intellij.openapi.roots.ProjectRootManager
import com.intellij.pom.java.LanguageLevel
import com.intellij.testFramework.IdeaTestUtil.getMockJdk21
import org.junit.Assert.assertEquals
import org.junit.Before
import org.mockito.Mockito.mockStatic
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.mock
import org.mockito.kotlin.whenever
import software.aws.toolkits.jetbrains.services.codemodernizer.CodeWhispererCodeModernizerTestBase
import kotlin.test.Test

class CodeTransformProjectUtilsTest : CodeWhispererCodeModernizerTestBase() {
    lateinit var projectRootManagerMock: ProjectRootManager
    lateinit var languageLevelProjectExtensionMock: LanguageLevelProjectExtension
    lateinit var sdkMock: Sdk

    @Before
    override fun setup() {
        super.setup()
        mockStatic(LanguageLevelProjectExtension::class.java)

        sdkMock = getMockJdk21()
        languageLevelProjectExtensionMock = mock<LanguageLevelProjectExtension>()

        whenever(LanguageLevelProjectExtension.getInstance(project)).doReturn(languageLevelProjectExtensionMock)
    }

    @Test
    fun `CodeTransformProjectUtils tryGetJdk() function returns project SDK when module language level is not set`() {
        mockStatic(ProjectRootManager::class.java)
        projectRootManagerMock = mock<ProjectRootManager>()
        whenever(ProjectRootManager.getInstance(project)).doReturn((projectRootManagerMock))
        whenever(projectRootManagerMock.projectSdk).doReturn(sdkMock)
        whenever(LanguageLevelProjectExtension.getInstance(project)).doReturn(null)
        val result = project.tryGetJdk()
        assertEquals(JavaSdkVersion.JDK_21, result)
    }

    @Test
    fun `CodeTransformProjectUtils tryGetJdk() function returns project SDK when module language level is set`() {
        mockStatic(ProjectRootManager::class.java)
        projectRootManagerMock = mock<ProjectRootManager>()
        whenever(ProjectRootManager.getInstance(project)).doReturn(projectRootManagerMock)
        whenever(projectRootManagerMock.projectSdk).doReturn(sdkMock)
        whenever(languageLevelProjectExtensionMock.languageLevel).doReturn(LanguageLevel.JDK_1_8)
        val result = project.tryGetJdk()
        assertEquals(JavaSdkVersion.JDK_1_8, result)
    }

    @Test
    fun `CodeTransformProjectUtils tryGetJdkLanguageLevelJdk() function returns null when language level is null`() {
        whenever(LanguageLevelProjectExtension.getInstance(project)).doReturn(null)
        val result = project.tryGetJdkLanguageLevelJdk()
        assertEquals(null, result)
    }

    @Test
    fun `CodeTransformProjectUtils tryGetJdkLanguageLevelJdk() function returns language level version`() {
        whenever(languageLevelProjectExtensionMock.languageLevel).doReturn(LanguageLevel.JDK_1_8)
        val result = project.tryGetJdkLanguageLevelJdk()
        assertEquals(JavaSdkVersion.JDK_1_8, result)
    }
}
