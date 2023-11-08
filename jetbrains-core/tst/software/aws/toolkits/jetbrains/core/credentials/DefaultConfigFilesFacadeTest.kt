// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.IterableAssert
import org.junit.Assume
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import software.amazon.awssdk.profiles.Profile
import software.aws.toolkits.core.utils.createParentDirectories
import software.aws.toolkits.core.utils.writeText
import java.nio.file.Files
import java.nio.file.Paths
import java.nio.file.attribute.PosixFilePermission
import java.nio.file.attribute.PosixFilePermissions

class DefaultConfigFilesFacadeTest {

    @Rule
    @JvmField
    val folderRule = TemporaryFolder()

    @Test
    fun canCreateCredentialsFileTemplateWithAppropriatePermissions() {
        val baseFolder = folderRule.newFolder()
        val file = Paths.get(baseFolder.absolutePath, ".aws", "credentials")
        val sut = DefaultConfigFilesFacade(configPath = file)
        sut.createConfigFile()

        assertThat(file).exists().hasContent(DefaultConfigFilesFacade.TEMPLATE)

        assumeNoException<UnsupportedOperationException> {
            assertThat(Files.getPosixFilePermissions(file)).matches("rw-------")
            assertThat(Files.getPosixFilePermissions(file.parent)).matches("rwxr-xr-x")
        }
    }

    @Test
    fun existingFolderPermissionsAreNotModified() {
        val baseFolder = folderRule.newFolder()
        baseFolder.setExecutable(true, false)
        baseFolder.setWritable(true, false)
        baseFolder.setReadable(true, false)
        val file = Paths.get(baseFolder.absolutePath, "credentials")

        val sut = DefaultConfigFilesFacade(configPath = file)
        sut.createConfigFile()

        assumeNoException<UnsupportedOperationException> {
            assertThat(Files.getPosixFilePermissions(file)).matches("rw-------")
            assertThat(Files.getPosixFilePermissions(file.parent)).matches("rwxrwxrwx")
        }
    }

    @Test
    fun `readAllProfiles reads across both config and credentials`() {
        val baseFolder = folderRule.newFolder()
        val config = Paths.get(baseFolder.absolutePath, ".aws", "config")
        config.createParentDirectories()
        config.writeText(
            """
            [profile profileName1]
            key1=config
            key2=config
            """.trimIndent()
        )
        val creds = Paths.get(baseFolder.absolutePath, ".aws", "credentials")
        creds.writeText(
            """
            [profileName2]
            key1=credentials
            key2=credentials
            """.trimIndent()
        )
        val sut = DefaultConfigFilesFacade(configPath = config, credentialsPath = creds)

        assertThat(sut.readAllProfiles())
            .hasSize(2)
    }

    @Test
    fun `readAllProfiles prefers credentials over config`() {
        val baseFolder = folderRule.newFolder()
        val config = Paths.get(baseFolder.absolutePath, ".aws", "config")
        config.createParentDirectories()
        config.writeText(
            """
            [profile profileName]
            key1=config
            key2=config
            key3=config
            """.trimIndent()
        )
        val creds = Paths.get(baseFolder.absolutePath, ".aws", "credentials")
        creds.writeText(
            """
            [profileName]
            key1=credentials
            key2=credentials
            """.trimIndent()
        )
        val sut = DefaultConfigFilesFacade(configPath = config, credentialsPath = creds)

        assertThat(sut.readAllProfiles())
            .hasSize(1)
            .satisfies {
                val entry = it.entries.first()
                assertThat(entry.key).isEqualTo("profileName")
                assertThat(entry.value).isEqualTo(
                    Profile.builder()
                        .name("profileName")
                        .properties(
                            mapOf(
                                "key1" to "credentials",
                                "key2" to "credentials",
                                "key3" to "config"
                            )
                        )
                        .build()
                )
            }
    }

    @Test
    fun `append profile to config`() {
        val baseFolder = folderRule.newFolder()
        val config = Paths.get(baseFolder.absolutePath, ".aws", "config")
        val creds = Paths.get(baseFolder.absolutePath, ".aws", "credentials")
        config.createParentDirectories()
        config.writeText("# should not be deleted")
        val sut = DefaultConfigFilesFacade(configPath = config, credentialsPath = creds)

        sut.appendProfileToConfig(
            Profile.builder()
                .name("profileName")
                .properties(
                    mapOf(
                        "key1" to "value1",
                        "key2" to "value2"
                    )
                )
                .build()
        )

        assertThat(config).hasContent(
            """
            # should not be deleted
            [profile profileName]
            key1=value1
            key2=value2
            """.trimIndent()
        )
        assertThat(creds).doesNotExist()
    }

    @Test
    fun `append profile to credentials`() {
        val baseFolder = folderRule.newFolder()
        val config = Paths.get(baseFolder.absolutePath, ".aws", "config")
        val creds = Paths.get(baseFolder.absolutePath, ".aws", "credentials")
        creds.createParentDirectories()
        creds.writeText("# should not be deleted")
        val sut = DefaultConfigFilesFacade(configPath = config, credentialsPath = creds)

        sut.appendProfileToCredentials(
            Profile.builder()
                .name("profileName")
                .properties(
                    mapOf(
                        "key1" to "value1",
                        "key2" to "value2"
                    )
                )
                .build()
        )

        assertThat(config).doesNotExist()
        assertThat(creds).hasContent(
            """
            # should not be deleted
            [profileName]
            key1=value1
            key2=value2
            """.trimIndent()
        )
    }

    @Test
    fun `append section to config`() {
        val baseFolder = folderRule.newFolder()
        val config = Paths.get(baseFolder.absolutePath, ".aws", "config")
        config.createParentDirectories()
        config.writeText("# should not be deleted")
        val creds = Paths.get(baseFolder.absolutePath, ".aws", "credentials")
        val sut = DefaultConfigFilesFacade(configPath = config, credentialsPath = creds)

        sut.appendSectionToConfig(
            "section",
            Profile.builder()
                .name("sectionName")
                .properties(
                    mapOf(
                        "key1" to "value1",
                        "key2" to "value2"
                    )
                )
                .build()
        )

        assertThat(config).hasContent(
            """
            # should not be deleted
            [section sectionName]
            key1=value1
            key2=value2
            """.trimIndent()
        )
        assertThat(creds).doesNotExist()
    }

    @Test
    fun `update section in config -- single section in config`() {
        val baseFolder = folderRule.newFolder()
        val config = Paths.get(baseFolder.absolutePath, ".aws", "config")
        config.createParentDirectories()
        config.writeText(
            """
            [sso-session sectionName]
            key1=value1
            key2=value2
            """.trimIndent()
        )
        val sut = DefaultConfigFilesFacade(configPath = config)

        sut.updateSectionInConfig(
            "sso-session",
            Profile.builder()
                .name("sectionName")
                .properties(
                    mapOf(
                        "key1" to "newValue1",
                        "key3" to "value3",
                        "key4" to "value4"
                    )
                )
                .build()
        )

        assertThat(config).hasContent(
            """
            [sso-session sectionName]
            key1=newValue1
            key2=value2
            key3=value3
            key4=value4
            """.trimIndent()
        )
    }

    @Test
    fun `update section in config -- multiple sections in config`() {
        val baseFolder = folderRule.newFolder()
        val config = Paths.get(baseFolder.absolutePath, ".aws", "config")
        config.createParentDirectories()
        config.writeText(
            """
            [profile preceding]
            a=b
            [sso-session sectionName]
            key1=value1
            key2=value2[
            [somethinginvalid
            [profile profile]
            key=value
            """.trimIndent()
        )
        val sut = DefaultConfigFilesFacade(configPath = config)

        sut.updateSectionInConfig(
            "sso-session",
            Profile.builder()
                .name("sectionName")
                .properties(
                    mapOf(
                        "key1" to "newValue1",
                        "key2" to "value2[",
                        "key3" to "value3",
                        "key4" to "value4"
                    )
                )
                .build()
        )

        assertThat(config).hasContent(
            """
            [profile preceding]
            a=b
            [sso-session sectionName]
            key1=newValue1
            key2=value2[
            key3=value3
            key4=value4
            [somethinginvalid
            [profile profile]
            key=value
            """.trimIndent()
        )
    }

    @Test
    fun `delete session from config on sign out - only sso-session`() {
        val baseFolder = folderRule.newFolder()
        val config = Paths.get(baseFolder.absolutePath, ".aws", "config")
        config.createParentDirectories()
        config.writeText(
            """
            [sso-session session1]
            sso_start_url=https://start
            sso_region=us-west-2
            sso_registration_scopes=scope1, scope2
            [profile session1-123-admin]
            sso_session=session1
            sso_account_id=123
            sso_role_name= admin
            [sso-session session2]
            sso_start_url=https://start
            sso_region=us-west-2
            sso_registration_scopes=scope1, scope2
            [sso-session session3]
            """.trimIndent()
        )
        val creds = Paths.get(baseFolder.absolutePath, ".aws", "credentials")
        val sut = DefaultConfigFilesFacade(configPath = config, credentialsPath = creds)
        sut.deleteSsoConnectionFromConfig("session2")
        assertThat(config).hasContent(
            """
            [sso-session session1]
            sso_start_url=https://start
            sso_region=us-west-2
            sso_registration_scopes=scope1, scope2
            [profile session1-123-admin]
            sso_session=session1
            sso_account_id=123
            sso_role_name= admin
            [sso-session session3]
            """.trimIndent()
        )
    }

    @Test
    fun `delete session from config on sign out`() {
        val baseFolder = folderRule.newFolder()
        val config = Paths.get(baseFolder.absolutePath, ".aws", "config")
        config.createParentDirectories()
        config.writeText(
            """
            [sso-session session1]
            sso_start_url=https://start
            sso_region=us-west-2
            sso_registration_scopes=scope1, scope2
            [profile session1-123-admin]
            sso_session=session1
            sso_account_id=123
            sso_role_name= admin
            [sso-session session2]
            sso_start_url=https://start
            sso_region=us-west-2
            sso_registration_scopes=scope1, scope2
            [profile session2-123-admin]
            sso_session=session2
            sso_account_id=123
            sso_role_name= admin
            [sso-session session3]
            """.trimIndent()
        )
        val creds = Paths.get(baseFolder.absolutePath, ".aws", "credentials")
        val sut = DefaultConfigFilesFacade(configPath = config, credentialsPath = creds)
        sut.deleteSsoConnectionFromConfig("session2")
        assertThat(config).hasContent(
            """
            [sso-session session1]
            sso_start_url=https://start
            sso_region=us-west-2
            sso_registration_scopes=scope1, scope2
            [profile session1-123-admin]
            sso_session=session1
            sso_account_id=123
            sso_role_name= admin
            [sso-session session3]
            """.trimIndent()
        )
    }

    @Test
    fun `delete session from config on sign out - profile name is different from session name`() {
        val baseFolder = folderRule.newFolder()
        val config = Paths.get(baseFolder.absolutePath, ".aws", "config")
        config.createParentDirectories()
        config.writeText(
            """
            [sso-session session1]
            sso_start_url=https://start
            sso_region=us-west-2
            sso_registration_scopes=scope1, scope2
            [profile session1-123-admin]
            sso_session=session1
            sso_account_id=123
            sso_role_name= admin
            [sso-session session2]
            sso_start_url=https://start
            sso_region=us-west-2
            sso_registration_scopes=scope1, scope2
            [profile othername-with-same-session]
            sso_session=session2
            sso_account_id=123
            sso_role_name= admin
            [sso-session session3]
            """.trimIndent()
        )
        val creds = Paths.get(baseFolder.absolutePath, ".aws", "credentials")
        val sut = DefaultConfigFilesFacade(configPath = config, credentialsPath = creds)
        sut.deleteSsoConnectionFromConfig("session2")
        assertThat(config).hasContent(
            """
            [sso-session session1]
            sso_start_url=https://start
            sso_region=us-west-2
            sso_registration_scopes=scope1, scope2
            [profile session1-123-admin]
            sso_session=session1
            sso_account_id=123
            sso_role_name= admin
            [sso-session session3]
            """.trimIndent()
        )
    }

    @Test
    fun `delete session from config on sign out - multiple profiles with same prefix`() {
        val baseFolder = folderRule.newFolder()
        val config = Paths.get(baseFolder.absolutePath, ".aws", "config")
        config.createParentDirectories()
        config.writeText(
            """
            [sso-session session1]
            sso_start_url=https://start
            sso_region=us-west-2
            sso_registration_scopes=scope1, scope2
            [profile session1-123-admin]
            sso_session=session1
            sso_account_id=123
            sso_role_name= admin
            [sso-session session2]
            sso_start_url=https://start
            sso_region=us-west-2
            sso_registration_scopes=scope1, scope2
            [profile session2-123-admin]
            aws_access_key=abjcbd
            aws_secret_access_key=123
            [profile session2-123-admin]
            sso_session=session2
            sso_account_id=123
            sso_role_name= admin
            [sso-session session3]
            """.trimIndent()
        )
        val creds = Paths.get(baseFolder.absolutePath, ".aws", "credentials")
        val sut = DefaultConfigFilesFacade(configPath = config, credentialsPath = creds)
        sut.deleteSsoConnectionFromConfig("session2")
        assertThat(config).hasContent(
            """
            [sso-session session1]
            sso_start_url=https://start
            sso_region=us-west-2
            sso_registration_scopes=scope1, scope2
            [profile session1-123-admin]
            sso_session=session1
            sso_account_id=123
            sso_role_name= admin
            [profile session2-123-admin]
            aws_access_key=abjcbd
            aws_secret_access_key=123
            [sso-session session3]
            """.trimIndent()
        )
    }

    @Test
    fun `delete session from config on sign out - multiple profiles in the same session`() {
        val baseFolder = folderRule.newFolder()
        val config = Paths.get(baseFolder.absolutePath, ".aws", "config")
        config.createParentDirectories()
        config.writeText(
            """
            [sso-session session1]
            sso_start_url=https://start
            sso_region=us-west-2
            sso_registration_scopes=scope1, scope2
            [profile session1-123-admin]
            sso_session=session1
            sso_account_id=123
            sso_role_name= admin
            [sso-session session2]
            sso_start_url=https://start
            sso_region=us-west-2
            sso_registration_scopes=scope1, scope2
            [profile session2-123-admin]
            aws_access_key=abjcbd
            aws_secret_access_key=123
            [profile session2-123-admin]
            sso_session=session2
            sso_account_id=123
            sso_role_name= admin
            [profile session2-345-admin]
            sso_session=session2
            sso_account_id=345
            sso_role_name= admin
            [sso-session session3]
            """.trimIndent()
        )
        val creds = Paths.get(baseFolder.absolutePath, ".aws", "credentials")
        val sut = DefaultConfigFilesFacade(configPath = config, credentialsPath = creds)
        sut.deleteSsoConnectionFromConfig("session2")
        assertThat(config).hasContent(
            """
            [sso-session session1]
            sso_start_url=https://start
            sso_region=us-west-2
            sso_registration_scopes=scope1, scope2
            [profile session1-123-admin]
            sso_session=session1
            sso_account_id=123
            sso_role_name= admin
            [profile session2-123-admin]
            aws_access_key=abjcbd
            aws_secret_access_key=123
            [sso-session session3]
            """.trimIndent()
        )
    }

    @Test
    fun `delete session from config on sign out - multiple profiles in the same session with profile before sso-session`() {
        val baseFolder = folderRule.newFolder()
        val config = Paths.get(baseFolder.absolutePath, ".aws", "config")
        config.createParentDirectories()
        config.writeText(
            """
            [sso-session session1]
            sso_start_url=https://start
            sso_region=us-west-2
            sso_registration_scopes=scope1, scope2
            [profile session1-123-admin]
            sso_session=session1
            sso_account_id=123
            sso_role_name= admin
            [profile session2-345-admin]
            sso_session=session2
            sso_account_id=345
            sso_role_name= admin
            [sso-session session2]
            sso_start_url=https://start
            sso_region=us-west-2
            sso_registration_scopes=scope1, scope2
            [profile session2-123-admin]
            aws_access_key=abjcbd
            aws_secret_access_key=123
            [profile session2-123-admin]
            sso_session=session2
            sso_account_id=123
            sso_role_name= admin
            [sso-session session3]
            """.trimIndent()
        )
        val creds = Paths.get(baseFolder.absolutePath, ".aws", "credentials")
        val sut = DefaultConfigFilesFacade(configPath = config, credentialsPath = creds)
        sut.deleteSsoConnectionFromConfig("session2")
        assertThat(config).hasContent(
            """
            [sso-session session1]
            sso_start_url=https://start
            sso_region=us-west-2
            sso_registration_scopes=scope1, scope2
            [profile session1-123-admin]
            sso_session=session1
            sso_account_id=123
            sso_role_name= admin
            [profile session2-123-admin]
            aws_access_key=abjcbd
            aws_secret_access_key=123
            [sso-session session3]
            """.trimIndent()
        )
    }

    private fun IterableAssert<PosixFilePermission>.matches(permissionString: String) {
        containsOnly(*PosixFilePermissions.fromString(permissionString).toTypedArray())
    }

    private inline fun <reified T> assumeNoException(block: () -> Unit) {
        try {
            block()
        } catch (e: Exception) {
            if (e is T) {
                Assume.assumeNoException(e)
            } else {
                throw e
            }
        }
    }
}
