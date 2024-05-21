// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer

import com.intellij.testFramework.LightVirtualFile
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Before
import org.junit.Test
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.spy
import org.mockito.kotlin.whenever
import software.aws.toolkits.jetbrains.services.codemodernizer.state.CodeTransformTelemetryState
import software.aws.toolkits.jetbrains.utils.rules.HeavyJavaCodeInsightTestFixtureRule
import kotlin.io.path.Path

class CodeTransformTelemetryTest : CodeWhispererCodeModernizerTestBase(HeavyJavaCodeInsightTestFixtureRule()) {
    @Before
    override fun setup() {
        super.setup()
    }

    @Test
    fun `SessionId updated on prepareForNewJobSubmission invoked`() {
        val originalSessionId = CodeTransformTelemetryState.instance.getSessionId()
        telemetryManagerSpy.prepareForNewJobSubmission()
        assertNotEquals(originalSessionId, CodeTransformTelemetryState.instance.getSessionId())
    }

    @Test
    fun `ProjectId is reproducible`() {
        val projectId1 = telemetryManagerSpy.getProjectHash(validJDK8CustomerSelection)
        val projectId2 = telemetryManagerSpy.getProjectHash(validJDK8CustomerSelection)
        assertEquals(projectId1, projectId2)
    }

    @Test
    fun `ProjectId changes when pom path changes`() {
        val projectId1 = telemetryManagerSpy.getProjectHash(validJDK8CustomerSelection)
        val emptyPomFileSpy2 = spy(LightVirtualFile("pom.xml", ""))
        doReturn(Path("/anotherpath/pom.xml")).whenever(emptyPomFileSpy2).toNioPath()
        val newCustomerSelection = validJDK8CustomerSelection.copy(configurationFile = emptyPomFileSpy2)
        val projectId2 = telemetryManagerSpy.getProjectHash(newCustomerSelection)
        assertNotEquals(projectId1, projectId2)
    }
}
