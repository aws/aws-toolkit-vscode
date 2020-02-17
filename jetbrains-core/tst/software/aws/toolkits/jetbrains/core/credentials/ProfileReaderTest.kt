// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import software.aws.toolkits.core.rules.SystemPropertyHelper
import software.aws.toolkits.jetbrains.core.credentials.profiles.validateAndGetProfiles
import java.io.File

class ProfileReaderTest {
    @Rule
    @JvmField
    val temporaryFolder = TemporaryFolder()

    @Rule
    @JvmField
    val systemPropertyHelper = SystemPropertyHelper()

    private lateinit var profileFile: File
    private lateinit var credentialsFile: File

    @Before
    fun setUp() {
        profileFile = temporaryFolder.newFile("config")
        credentialsFile = temporaryFolder.newFile("credentials")

        System.getProperties().setProperty("aws.configFile", profileFile.absolutePath)
        System.getProperties().setProperty("aws.sharedCredentialsFile", credentialsFile.absolutePath)
    }

    @Test
    fun testSourceProfileDoesNotExist() {
        profileFile.writeText(
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
        assertThat(invalidProfiles.mapValues { it.value.message })
            .containsKey("role")
            .containsValue("Profile 'role' references source profile 'source_profile' which does not exist")
    }

    @Test
    fun testCircularChainProfiles() {
        profileFile.writeText(
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
        assertThat(invalidProfiles.mapValues { it.value.message })
            .containsKey("role")
            .containsValue("A circular profile dependency was found between role->source_profile->source_profile2->source_profile3->source_profile")
    }
}
