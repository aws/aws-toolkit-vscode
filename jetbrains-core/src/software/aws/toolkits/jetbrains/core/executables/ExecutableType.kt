// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.executables

import com.intellij.openapi.application.PathManager
import com.intellij.openapi.extensions.ExtensionPointName
import com.intellij.util.io.createDirectories
import java.nio.file.Path
import java.nio.file.Paths

interface ExecutableType<VersionScheme> {
    val id: String
    val displayName: String

    /**
     * Determine the version number of the given path
     */
    fun version(path: Path): VersionScheme

    companion object {
        val EP_NAME = ExtensionPointName<ExecutableType<*>>("aws.toolkit.executable")

        internal fun executables(): List<ExecutableType<*>> = EP_NAME.extensions.toList()

        @JvmStatic
        fun <T : ExecutableType<*>> getExecutable(clazz: Class<T>): T = executables().filterIsInstance(clazz).first()

        inline fun <reified T : ExecutableType<*>> getInstance(): ExecutableType<*> = getExecutable(T::class.java)

        val EXECUTABLE_DIRECTORY: Path = Paths.get(PathManager.getSystemPath(), "aws-static-resources", "executables").createDirectories()
    }
}

interface AutoResolvable {

    /**
     * Attempt to automatically resolve the path
     *
     * @return the resolved path or null if not found
     * @throws if an exception occurred attempting to resolve the path, when success was expected
     */
    fun resolve(): Path?
}

interface Validatable {

    /**
     * Validate the executable at the given path, this may include version checks
     * or any other validation required to ensure this executable is compatible with
     * the toolkit.
     *
     * If validation fails throw exception, [Exception.message] is displayed to the user
     */
    fun validate(path: Path)
}
