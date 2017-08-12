package com.amazonaws.intellij.credentials

import com.amazonaws.auth.profile.ProfilesConfigFile
import com.amazonaws.auth.profile.internal.BasicProfile
import com.amazonaws.auth.profile.internal.ProfileKeyConstants
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File
import java.nio.charset.StandardCharsets

internal class CredentialFileWriterTest {
    @Rule
    @JvmField
    val temporaryDirectory = TemporaryFolder()

    @Test
    fun testDumpToFile() {
        val credentialsFile = createCredentialsFile()

        val profiles = arrayOf(
                BasicProfile("a", basicCred1),
                BasicProfile("b", basicCred2),
                BasicProfile("c", sessionCred1),
                BasicProfile("d", sessionCred2)
        )
        CredentialFileWriter.dumpToFile(credentialsFile, true, *profiles)
        checkCredentialsFile(credentialsFile, *profiles)

        // Rewrite the file with overwrite=true
        val profile = arrayOf(BasicProfile("a", basicCred1))
        CredentialFileWriter.dumpToFile(credentialsFile, true, *profile)
        checkCredentialsFile(credentialsFile, *profile)

        // Rewrite the file with overwrite=false is not allowed
        assertThatThrownBy { CredentialFileWriter.dumpToFile(credentialsFile, false, BasicProfile("a", basicCred1)) }
                .isInstanceOf(IllegalStateException::class.java)
    }

    @Test
    fun testModifyProfile() {
        val credentialsFile = temporaryDirectory.newFile("credentials")

        val profiles = arrayOf(
                BasicProfile("a", basicCred1),
                BasicProfile("b", basicCred2),
                BasicProfile("c", sessionCred1),
                BasicProfile("d", sessionCred2)
        )
        CredentialFileWriter.dumpToFile(credentialsFile, true, *profiles)

        // a <==> c, b <==> d
        val modified = arrayOf(
                BasicProfile("a", sessionCred1),
                BasicProfile("b", sessionCred2),
                BasicProfile("c", basicCred1),
                BasicProfile("d", basicCred2)
        )
        CredentialFileWriter.modifyOrInsertProfiles(credentialsFile, *modified)
        checkCredentialsFile(credentialsFile, *modified)
    }

    @Test
    fun testInsertProfile() {
        val credentialsFile = temporaryDirectory.newFile("credentials")

        val profiles = arrayOf(
                BasicProfile("a", basicCred1),
                BasicProfile("b", basicCred2),
                BasicProfile("c", sessionCred1),
                BasicProfile("d", sessionCred2)
        )
        CredentialFileWriter.dumpToFile(credentialsFile, true, *profiles)

        // Insert [e] profile
        val e = BasicProfile("e", basicCred1)
        CredentialFileWriter.modifyOrInsertProfiles(credentialsFile, e)
        checkCredentialsFile(credentialsFile, *profiles, e)
    }

    @Test
    fun testModifyAndInsertProfile() {
        val credentialsFile = temporaryDirectory.newFile("credentials")

        val profiles = arrayOf(
                BasicProfile("a", basicCred1),
                BasicProfile("b", basicCred2),
                BasicProfile("c", sessionCred1),
                BasicProfile("d", sessionCred2)
        )
        CredentialFileWriter.dumpToFile(credentialsFile, true, *profiles)

        // a <==> c, b <==> d, +e
        val modified = arrayOf(
                BasicProfile("a", sessionCred1),
                BasicProfile("b", sessionCred2),
                BasicProfile("c", basicCred1),
                BasicProfile("d", basicCred2),
                BasicProfile("e", basicCred1)
        )
        CredentialFileWriter.modifyOrInsertProfiles(credentialsFile, *modified)
        checkCredentialsFile(credentialsFile, *modified)
    }

    /**
     * Tests that comments and unsupported properties are preserved after
     * profile modification.
     */
    @Test
    fun testModifyAndInsertProfile_WithComments() {
        val originalProfile = """
                              # I love comments...

                              # [a]
                              [a]
                              #aws_access_key_id=wrong-key
                              aws_access_key_id=basicCred1access
                              # More comments...
                              aws_secret_access_key=basicCred1secret
                              unsupported_property=foo

                              # More comments...

                              [b]
                              # More comments...
                              aws_access_key_id=basicCred2access
                              aws_secret_access_key=basicCred2secret

                              [c]
                              aws_access_key_id=sessionCred1access
                              # More comments...
                              aws_secret_access_key=sessionCred1secret
                              aws_session_token=sessionCred1session

                              [d]
                              aws_access_key_id=sessionCred2access
                              aws_secret_access_key=sessionCred2secret
                              # More comments...
                              aws_session_token=sessionCred2session

                              # More comments...
                              """.trimIndent()

        val credentialsFile = createCredentialsFile()
        credentialsFile.writeText(originalProfile, StandardCharsets.UTF_8)

        val expected = arrayOf(
                BasicProfile("a", basicCred1.plus(Pair("unsupported_property", "foo"))),
                BasicProfile("b", basicCred2),
                BasicProfile("c", sessionCred1),
                BasicProfile("d", sessionCred2)
        )
        checkCredentialsFile(credentialsFile, *expected)

        // a <==> b, c <==> d, also renaming them to uppercase letters
        val modified = arrayOf(
                BasicProfile("A", basicCred2.plus(Pair("unsupported_property", "foo"))),
                BasicProfile("B", basicCred1),
                BasicProfile("C", sessionCred2),
                BasicProfile("D", sessionCred1)
        )

        val updatedProfiles = mapOf(
                Pair("a", modified[0]),
                Pair("b", modified[1]),
                Pair("c", modified[2]),
                Pair("d", modified[3])
        )

        CredentialFileWriter.modifyProfiles(credentialsFile, updatedProfiles)
        checkCredentialsFile(credentialsFile, *modified)

        // Sanity check that the content is altered
        val modifiedContent = credentialsFile.readText(StandardCharsets.UTF_8)
        assertThat(modifiedContent).isNotEqualTo(originalProfile)

        // Restore the properties
        val restoredProfiles = mapOf(
                Pair("A", expected[0]),
                Pair("B", expected[1]),
                Pair("C", expected[2]),
                Pair("D", expected[3])
        )
        CredentialFileWriter.modifyProfiles(credentialsFile, restoredProfiles)
        checkCredentialsFile(credentialsFile, *expected)

        // Check that the content is now the same as the original
        assertThat(credentialsFile).hasContent(originalProfile)
    }

    @Test
    fun testRenameProfile() {
        val credentialsFile = temporaryDirectory.newFile("credentials")

        val profiles = arrayOf(
                BasicProfile("a", basicCred1),
                BasicProfile("b", basicCred2),
                BasicProfile("c", sessionCred1),
                BasicProfile("d", sessionCred2)
        )
        CredentialFileWriter.dumpToFile(credentialsFile, true, *profiles)

        // Rename a to A
        val modified = arrayOf(
                BasicProfile("A", basicCred1),
                BasicProfile("b", basicCred2),
                BasicProfile("c", sessionCred1),
                BasicProfile("d", sessionCred2)
        )
        CredentialFileWriter.modifyOneProfile(credentialsFile, "a", BasicProfile("A", basicCred1))
        checkCredentialsFile(credentialsFile, *modified)
    }

    @Test
    fun testDeleteProfile() {
        val credentialsFile = temporaryDirectory.newFile("credentials")

        val profiles = arrayOf(
                BasicProfile("a", basicCred1),
                BasicProfile("b", basicCred2),
                BasicProfile("c", sessionCred1),
                BasicProfile("d", sessionCred2)
        )
        CredentialFileWriter.dumpToFile(credentialsFile, true, *profiles)

        // Delete a and c
        val modified = arrayOf(
                BasicProfile("b", basicCred2),
                BasicProfile("d", sessionCred2)
        )
        CredentialFileWriter.deleteProfiles(credentialsFile, "a", "c")
        checkCredentialsFile(credentialsFile, *modified)
    }

    /**
     * Tests that the original credentials file is properly restored if the
     * in-place modification fails with error.
     */
    @Test
    fun testInPlaceModificationErrorHandling() {
        val credentialsFile = temporaryDirectory.newFile("credentials")

        val profiles = arrayOf(
                BasicProfile("a", basicCred1),
                BasicProfile("b", basicCred2),
                BasicProfile("c", sessionCred1),
                BasicProfile("d", sessionCred2)
        )
        CredentialFileWriter.dumpToFile(credentialsFile, true, *profiles)
        val originalContent = credentialsFile.readText(StandardCharsets.UTF_8)

        // Insert [e] profile, which throws RuntimeException when the getProperties method is called.
        val e = object : BasicProfile("e", emptyMap()) {
            override fun getProperties(): Map<String, String> {
                throw RuntimeException("Some exception...")
            }
        }
        assertThatThrownBy { CredentialFileWriter.modifyOrInsertProfiles(credentialsFile, e) }

        // Check that the original file is restored
        assertThat(credentialsFile).exists().hasContent(originalContent)
    }

    private fun createCredentialsFile(): File {
        return temporaryDirectory.newFile("credentials")
    }

    companion object {
        private val basicCred1 = mapOf(
                Pair(ProfileKeyConstants.AWS_ACCESS_KEY_ID, "basicCred1access"),
                Pair(ProfileKeyConstants.AWS_SECRET_ACCESS_KEY, "basicCred1secret")
        )

        private val basicCred2 = mapOf(
                Pair(ProfileKeyConstants.AWS_ACCESS_KEY_ID, "basicCred2access"),
                Pair(ProfileKeyConstants.AWS_SECRET_ACCESS_KEY, "basicCred2secret")
        )

        private val sessionCred1 = mapOf(
                Pair(ProfileKeyConstants.AWS_ACCESS_KEY_ID, "sessionCred1access"),
                Pair(ProfileKeyConstants.AWS_SECRET_ACCESS_KEY, "sessionCred1secret"),
                Pair(ProfileKeyConstants.AWS_SESSION_TOKEN, "sessionCred1session")
        )

        private val sessionCred2 = mapOf(
                Pair(ProfileKeyConstants.AWS_ACCESS_KEY_ID, "sessionCred2access"),
                Pair(ProfileKeyConstants.AWS_SECRET_ACCESS_KEY, "sessionCred2secret"),
                Pair(ProfileKeyConstants.AWS_SESSION_TOKEN, "sessionCred2session")
        )

        /**
         * Loads the given credentials file and checks that it contains the same
         * set of profiles as expected.
         */
        private fun checkCredentialsFile(file: File, vararg expectedProfiles: BasicProfile) {
            val parsedFile = ProfilesConfigFile(file)
            val loadedProfiles = parsedFile.allBasicProfiles

            assertThat(loadedProfiles).hasSameSizeAs(expectedProfiles)

            for (expectedProfile in expectedProfiles) {
                val loadedProfile = loadedProfiles[expectedProfile.profileName]
                assertThat(loadedProfile).isEqualToComparingFieldByField(expectedProfile)
            }
        }
    }
}