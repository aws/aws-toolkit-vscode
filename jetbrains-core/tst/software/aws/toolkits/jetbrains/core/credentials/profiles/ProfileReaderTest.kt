// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.profiles

import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import software.aws.toolkits.core.rules.SystemPropertyHelper
import software.aws.toolkits.resources.message
import java.io.File

class ProfileReaderTest {
    @Rule
    @JvmField
    val temporaryFolder = TemporaryFolder()

    @Rule
    @JvmField
    val systemPropertyHelper = SystemPropertyHelper()

    private lateinit var configFile: File
    private lateinit var credentialsFile: File

    @Before
    fun setUp() {
        configFile = temporaryFolder.newFile("config")
        credentialsFile = temporaryFolder.newFile("credentials")

        System.getProperties().setProperty("aws.configFile", configFile.absolutePath)
        System.getProperties().setProperty("aws.sharedCredentialsFile", credentialsFile.absolutePath)
    }

    @Test
    fun testSourceProfileDoesNotExist() {
        configFile.writeText(
            """
            [profile role]
            role_arn=arn1
            role_session_name=testSession
            source_profile=source_profile
            external_id=externalId
            """.trimIndent()
        )

        val (validProfiles, invalidProfiles) = validateAndGetProfiles()
        assertThat(validProfiles).isEmpty()
        assertThat(invalidProfiles.map { it.key to it.value.message })
            .contains("role" to message("credentials.profile.source_profile_not_found", "role", "source_profile"))
    }

    @Test
    fun testCircularChainProfiles() {
        configFile.writeText(
            """
            [profile role]
            role_arn=arn1
            source_profile=source_profile

            [profile source_profile]
            role_arn=arn2
            source_profile=source_profile2

            [profile source_profile2]
            role_arn=arn3
            source_profile=source_profile3

            [profile source_profile3]
            role_arn=arn4
            source_profile=source_profile
            """.trimIndent()
        )

        val (validProfiles, invalidProfiles) = validateAndGetProfiles()
        assertThat(validProfiles).isEmpty()
        assertThat(invalidProfiles.map { it.key to it.value.message })
            .contains(
                "role" to message(
                    "credentials.profile.circular_profiles", "role",
                    "role->source_profile->source_profile2->source_profile3->source_profile"
                )
            )
    }

    @Test
    fun testSelfReferencingChain() {
        configFile.writeText(
            """
            [profile role]
            role_arn=arn1
            source_profile=role
            """.trimIndent()
        )

        val (validProfiles, invalidProfiles) = validateAndGetProfiles()
        assertThat(validProfiles).isEmpty()
        assertThat(invalidProfiles.map { it.key to it.value.message })
            .contains("role" to message("credentials.profile.circular_profiles", "role", "role->role"))
    }

    @Test
    fun testAssumeRoleWithoutSourceProfile() {
        configFile.writeText(
            """
            [profile role]
            role_arn = arn:aws:iam::xxx:role/<role>
            """.trimIndent()
        )

        val (validProfiles, invalidProfiles) = validateAndGetProfiles()
        assertThat(validProfiles).isEmpty()
        assertThat(invalidProfiles.map { it.key to it.value.message })
            .contains("role" to message("credentials.profile.missing_property", "role", "source_profile"))
    }

    @Test
    fun testNestedAssumeRoleWithoutSourceProfile() {
        configFile.writeText(
            """
            [profile role]
            role_arn=arn1
            source_profile=source_profile

            [profile source_profile]
            role_arn=arn2
            """.trimIndent()
        )

        val (validProfiles, invalidProfiles) = validateAndGetProfiles()
        assertThat(validProfiles).isEmpty()
        assertThat(invalidProfiles.map { it.key to it.value.message })
            .contains("role" to message("credentials.profile.missing_property", "source_profile", "source_profile"))
            .contains("source_profile" to message("credentials.profile.missing_property", "source_profile", "source_profile"))
    }
}
