package software.aws.toolkits.jetbrains.credentials

import com.amazonaws.auth.profile.ProfilesConfigFile
import com.amazonaws.auth.profile.internal.AbstractProfilesConfigFileScanner
import com.amazonaws.auth.profile.internal.BasicProfile
import com.amazonaws.auth.profile.internal.ProfileKeyConstants
import com.amazonaws.util.StringUtils
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.diagnostic.debug
import java.io.File
import java.io.FileOutputStream
import java.io.OutputStreamWriter
import java.io.Writer
import java.nio.charset.StandardCharsets
import java.util.Collections
import java.util.HashMap
import java.util.HashSet
import java.util.LinkedHashMap
import java.util.Scanner
import java.util.UUID

/**
 * The class for creating and modifying the credential profiles file.
 *
 * TODO: This should be handled by the SDK, https://github.com/aws/aws-sdk-java-v2/issues/31
 */
object CredentialFileWriter {
    private val LOG = Logger.getInstance(CredentialFileWriter.javaClass)

    /**
     * Write all the credential profiles to a file. Note that this method will
     * clobber the existing content in the destination file if it's in the
     * overwrite mode. Use [modifyOrInsertProfiles]
     * instead, if you want to perform in-place modification on your existing
     * credentials file.
     *
     * @param destination The destination file where the credentials will be written to.
     * @param overwrite If true, this method If false, this method will throw exception if the file already exists.
     * @param profiles All the credential profiles to be written.
     */
    fun dumpToFile(destination: File, overwrite: Boolean, vararg profiles: BasicProfile) {
        if (destination.exists() && !overwrite) {
            throw IllegalStateException(
                    "The destination file already exists. Set overwrite=true if you want to clobber the existing " +
                            "content and completely re-write the file.")
        }

        OutputStreamWriter(FileOutputStream(destination, false), StandardCharsets.UTF_8).use { writer ->
            val modifications = LinkedHashMap<String, BasicProfile>()
            for (profile in profiles) {
                modifications.put(profile.profileName, profile)
            }
            ProfilesConfigFileWriterHelper(writer, modifications).writeWithoutExistingContent()
        }
    }

    /**
     * Modify or insert new profiles into an existing credentials file by
     * in-place modification. Only the properties of the affected profiles will
     * be modified; all the unaffected profiles and comment lines will remain
     * the same. This method does not support renaming a profile.

     * @param destination The destination file to modify
     * @param profiles All the credential profiles to be written.
     */
    fun modifyOrInsertProfiles(destination: File, vararg profiles: BasicProfile) {
        val modifications = LinkedHashMap<String, BasicProfile>()
        for (profile in profiles) {
            modifications.put(profile.profileName, profile)
        }

        modifyProfiles(destination, modifications)
    }

    /**
     * Modify one profile in the existing credentials file by in-place
     * modification. This method will rename the existing profile if the
     * specified Profile has a different name.

     * @param destination The destination file to modify
     * @param profileName The name of the existing profile to be modified
     * @param newProfile The new Profile object.
     */
    fun modifyOneProfile(destination: File, profileName: String, newProfile: BasicProfile) {
        val modifications = Collections.singletonMap(profileName, newProfile)

        modifyProfiles(destination, modifications)
    }

    /**
     * Remove one or more profiles from the existing credentials file by
     * in-place modification.

     * @param destination The destination file to modify
     * @param profileNames The names of all the profiles to be deleted.
     */
    fun deleteProfiles(destination: File, vararg profileNames: String) {
        modifyProfiles(destination, profileNames.associateBy({ it }, { null }))
    }

    /**
     * A method that supports all kinds of profile modification,
     * including renaming or deleting one or more profiles.
     *
     * @param modifications Use null value to indicate a profile that is to be deleted.
     */
    fun modifyProfiles(destination: File, modifications: Map<String, BasicProfile?>) {
        val inPlaceModify = destination.exists()

        // We can't use File.createTempFile, since it will always create that file no matter what, and File.renameTo
        // does not allow the destination to be an existing file
        val stashLocation = File(destination.parentFile, destination.name + ".bak." + UUID.randomUUID().toString())

        // Stash the original file, before we apply the changes
        if (inPlaceModify) {
            val stashed = destination.renameTo(stashLocation)
            if (!stashed) {
                throw IllegalStateException("Failed to stash the existing credentials file before applying the changes.")
            } else {
                if (LOG.isDebugEnabled) {
                    LOG.debug(String.format("The original credentials file is stashed to location (%s).", stashLocation.absolutePath))
                }
            }
        }

        try {
            OutputStreamWriter(FileOutputStream(destination), StringUtils.UTF8).use { writer ->
                val writerHelper = ProfilesConfigFileWriterHelper(writer, modifications)

                if (inPlaceModify) {
                    val existingContent = Scanner(stashLocation, StandardCharsets.UTF_8.name())
                    writerHelper.writeWithExistingContent(existingContent)
                } else {
                    writerHelper.writeWithoutExistingContent()
                }

                // Make sure the output is valid and can be loaded by the loader
                ProfilesConfigFile(destination)

                if (inPlaceModify && !stashLocation.delete()) {
                    LOG.debug {
                        "Successfully modified the credentials file. But failed to delete the stashed copy of the " +
                                "original file (${stashLocation.absolutePath})."
                    }
                }
            }
        } catch (e: Exception) {
            // Restore the stashed file
            if (inPlaceModify) {
                // We don't really care about what destination.delete() returns, since the file might not have been
                // created when the error occurred.
                if (!destination.delete()) {
                    LOG.debug { "Unable to remove the credentials file before restoring the original one." }
                }

                if (!stashLocation.renameTo(destination)) {
                    throw IllegalStateException("Unable to restore the original credentials file. File content " +
                            "stashed in ${stashLocation.absolutePath}")
                }
            }

            throw IllegalStateException("Unable to modify the credentials file. (The original file has been restored.)",
                    e)
        }
    }

    /**
     * Implementation of AbstractProfilesConfigFileScanner, which reads the
     * content from an existing credentials file (if any) and then modifies some
     * of the profile properties in place.
     *
     * @constructor Creates ProfilesConfigFileWriterHelper with the specified new profiles.
     * @param writer The writer where the modified content is output to.
     * @param modifications A map of all the new profiles, keyed by the profile name.
     * If a profile name is associated with a null value, it's profile content will be removed.
     */
    private class ProfilesConfigFileWriterHelper(private val writer: Writer, modifications: Map<String, BasicProfile?>)
        : AbstractProfilesConfigFileScanner() {

        /** Map of all the profiles to be modified, keyed by profile names  */
        private val newProfiles = LinkedHashMap<String, BasicProfile>()

        /** Map of the names of all the profiles to be deleted  */
        private val deletedProfiles = HashSet<String>()

        private val buffer = StringBuilder()
        private val existingProfileProperties = HashMap<String, MutableSet<String>>()

        init {
            for ((profileName, profile) in modifications) {
                if (profile == null) {
                    deletedProfiles.add(profileName)
                } else {
                    newProfiles.put(profileName, profile)
                }
            }
        }

        /**
         * Append the new profiles to the writer, by reading from empty content.
         */
        fun writeWithoutExistingContent() {
            buffer.setLength(0)
            existingProfileProperties.clear()

            // Use empty String as input, since we are bootstrapping a new file.
            run(Scanner(""))
        }

        /**
         * Read the existing content of a credentials file, and then make
         * in-place modification according to the new profiles specified in this
         * class.
         */
        fun writeWithExistingContent(existingContent: Scanner) {
            buffer.setLength(0)
            existingProfileProperties.clear()

            run(existingContent)
        }

        override fun onEmptyOrCommentLine(profileName: String?, line: String) {
            /*
             * Buffer the line until we reach the next property line or the end
             * of the profile. We do this so that new properties could be
             * inserted at more appropriate location. For example:
             *
             * [default]
             * # access key
             * aws_access_key_id=aaa
             * # secret key
             * aws_secret_access_key=sss
             * # We want new properties to be inserted before this line
             * # instead of after the following empty line
             *
             * [next profile]
             * ...
             */
            if (profileName == null || !deletedProfiles.contains(profileName)) {
                buffer(line)
            }
        }

        override fun onProfileStartingLine(profileName: String, line: String) {
            var profileNameLine = line
            existingProfileProperties.put(profileName, HashSet<String>())

            // Copy the line after flush the buffer
            flush()

            if (deletedProfiles.contains(profileName)) {
                return
            }

            // If the profile name is changed
            newProfiles[profileName]?.let {
                val newProfileName = it.profileName
                if (newProfileName != profileName) {
                    profileNameLine = "[$newProfileName]"
                }
            }

            writeLine(profileNameLine)
        }

        override fun onProfileEndingLine(prevProfileName: String) {
            // Check whether we need to insert new properties into this profile
            val modifiedProfile = newProfiles[prevProfileName]
            if (modifiedProfile != null) {
                for ((propertyKey, propertyValue) in modifiedProfile.properties) {
                    if (!existingProfileProperties[prevProfileName]!!.contains(propertyKey)) {
                        writeProperty(propertyKey, propertyValue)
                    }
                }
            }

            // flush all the buffered comments and empty lines
            flush()
        }

        override fun onProfileProperty(profileName: String,
                                       propertyKey: String, propertyValue: String,
                                       isSupportedProperty: Boolean, line: String) {
            // Record that this property key has been declared for this profile
            existingProfileProperties.putIfAbsent(profileName, HashSet<String>())
            existingProfileProperties[profileName]!!.add(propertyKey)

            if (deletedProfiles.contains(profileName)) {
                return
            }

            // Keep the unsupported properties
            if (!isSupportedProperty) {
                writeLine(line)
                return
            }

            // flush all the buffered comments and empty lines before this property line
            flush()

            // Modify the property value
            if (newProfiles.containsKey(profileName)) {
                val newValue = newProfiles[profileName]!!.getPropertyValue(propertyKey)
                if (newValue != null) {
                    writeProperty(propertyKey, newValue)
                }
                // else remove that line
            } else {
                writeLine(line)
            }
        }

        override fun onEndOfFile() {
            // Append profiles that don't exist in the original file
            for ((profileName, profile) in newProfiles) {
                if (!existingProfileProperties.containsKey(profileName)) {
                    // The profile name is not found in the file
                    // Append the profile properties
                    writeProfile(profile)
                    writeLine("")
                }
            }

            // Flush the "real" writer
            writer.flush()
        }

        override fun isSupportedProperty(propertyName: String): Boolean {
            return ProfileKeyConstants.AWS_ACCESS_KEY_ID == propertyName ||
                    ProfileKeyConstants.AWS_SECRET_ACCESS_KEY == propertyName ||
                    ProfileKeyConstants.AWS_SESSION_TOKEN == propertyName ||
                    ProfileKeyConstants.EXTERNAL_ID == propertyName ||
                    ProfileKeyConstants.ROLE_ARN == propertyName ||
                    ProfileKeyConstants.ROLE_SESSION_NAME == propertyName ||
                    ProfileKeyConstants.SOURCE_PROFILE == propertyName ||
                    ProfileKeyConstants.REGION == propertyName
        }

        private fun writeProfile(profile: BasicProfile) {
            writeProfileName(profile.profileName)
            profile.properties.forEach(this::writeProperty)
        }

        private fun writeProfileName(profileName: String) {
            writeLine(String.format("[%s]", profileName))
        }

        private fun writeProperty(propertyKey: String, propertyValue: String) {
            writeLine(String.format("%s=%s", propertyKey, propertyValue))
        }

        private fun writeLine(line: String) {
            append(String.format("%s%n", line))
        }

        private fun append(str: String) {
            writer.append(str)
        }

        private fun flush() {
            if (buffer.isNotEmpty()) {
                append(buffer.toString())
                buffer.setLength(0)
            }
        }

        private fun buffer(line: String) {
            buffer.append(String.format("%s%n", line))
        }
    }
}
