// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.testFramework.ApplicationRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.core.region.aRegionId
import software.aws.toolkits.core.utils.test.aString
import software.aws.toolkits.jetbrains.utils.isInstanceOf
import software.aws.toolkits.jetbrains.utils.isInstanceOfSatisfying

class DefaultToolkitAuthManagerTest {
    @JvmField
    @Rule
    val applicationRule = ApplicationRule()

    private lateinit var sut: DefaultToolkitAuthManager

    @Before
    fun setUp() {
        sut = DefaultToolkitAuthManager()
    }

    @Test
    fun `creates ManagedBearerSsoConnection from ManagedSsoProfile`() {
        val profile = ManagedSsoProfile(
            aRegionId(),
            aString(),
            listOf(aString())
        )
        val connection = sut.createConnection(profile)

        assertThat(connection).isInstanceOf<ManagedBearerSsoConnection>()
        connection as ManagedBearerSsoConnection
        assertThat(connection.region).isEqualTo(profile.ssoRegion)
        assertThat(connection.startUrl).isEqualTo(profile.startUrl)
        assertThat(connection.scopes).isEqualTo(profile.scopes)
    }

    @Test
    fun `creates ManagedBearerSsoConnection from serialized ManagedSsoProfile`() {
        val profile = ManagedSsoProfile(
            aRegionId(),
            aString(),
            listOf(aString())
        )
        sut.createConnection(profile)

        assertThat(sut.state?.ssoProfiles).satisfies { profiles ->
            assertThat(profiles).isNotNull()
            assertThat(profiles).singleElement().isEqualTo(profile)
        }
    }

    @Test
    fun `serializes ManagedSsoProfile from ManagedBearerSsoConnection`() {
        val profile = ManagedSsoProfile(
            aRegionId(),
            aString(),
            listOf(aString())
        )

        sut.loadState(
            ToolkitAuthManagerState(
                ssoProfiles = listOf(profile)
            )
        )

        assertThat(sut.listConnections()).singleElement().satisfies {
            assertThat(it).isInstanceOfSatisfying<ManagedBearerSsoConnection> { connection ->
                assertThat(connection.region).isEqualTo(profile.ssoRegion)
                assertThat(connection.startUrl).isEqualTo(profile.startUrl)
                assertThat(connection.scopes).isEqualTo(profile.scopes)
            }
        }
    }
}
