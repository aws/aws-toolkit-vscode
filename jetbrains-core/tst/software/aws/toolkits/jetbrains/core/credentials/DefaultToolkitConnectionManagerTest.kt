// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.testFramework.ProjectRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.core.utils.test.aString
import software.aws.toolkits.jetbrains.utils.isInstanceOf

class DefaultToolkitConnectionManagerTest {
    @JvmField
    @Rule
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val credManager = MockCredentialManagerRule()

    @JvmField
    @Rule
    val authManager = MockToolkitAuthManagerRule()

    private lateinit var sut: DefaultToolkitConnectionManager

    @Before
    fun setUp() {
        sut = DefaultToolkitConnectionManager(projectRule.project)
    }

    @Test
    fun `active connection is null if no connection or credentials`() {
        credManager.clear()
        assertThat(sut.activeConnection()).isNull()
    }

    @Test
    fun `active connection defaults to credentials`() {
        assertThat(sut.activeConnection()).isInstanceOf<AwsConnectionManagerConnection>()
    }

    @Test
    fun `loads connection from state`() {
        credManager.clear()
        val connection = authManager.createConnection(ManagedSsoProfile(aString(), aString(), emptyList()))
        assertThat(sut.activeConnection()).isEqualTo(null)
        sut.loadState(ToolkitConnectionManagerState(connection.id))

        assertThat(sut.activeConnection()).isEqualTo(connection)
    }
}
