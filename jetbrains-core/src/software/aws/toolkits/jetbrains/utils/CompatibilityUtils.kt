// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import com.google.common.collect.BiMap
import com.intellij.openapi.Disposable
import com.intellij.openapi.extensions.ExtensionPointName
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.testFramework.PlatformTestCase
import com.intellij.testFramework.PlatformTestUtil
import com.intellij.util.concurrency.AppExecutorUtil
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.asCoroutineDispatcher
import org.jetbrains.annotations.TestOnly
import software.aws.toolkits.core.utils.tryOrNull
import java.io.File
import java.nio.file.Path

/**
 * A set of functions that attempt to abstract API differences that are incompatible between IDEA versions.
 *
 * This can act as a central place where said logic can be removed as min-version increases
 */
object CompatibilityUtils {
    /**
     * Can be removed when min-version is 19.3 FIX_WHEN_MIN_IS_193
     */
    @TestOnly
    fun <T> registerExtension(name: ExtensionPointName<T>, extension: T, disposable: Disposable) {
        registerExtensions(name, listOf(extension), disposable)
    }

    /**
     * Can be removed when min-version is 19.3 FIX_WHEN_MIN_IS_193
     */
    @TestOnly
    fun <T> registerExtensions(name: ExtensionPointName<T>, extensions: List<T>, disposable: Disposable) {
        val extensionTestUtil = tryOrNull { Class.forName("com.intellij.testFramework.ExtensionTestUtil") }

        // 193+
        if (extensionTestUtil != null) {
            extensionTestUtil.getMethod("maskExtensions", ExtensionPointName::class.java, List::class.java, Disposable::class.java)
                .invoke(null, name, extensions, disposable)
        } else {
            PlatformTestUtil::class.java.getMethod("maskExtensions", ExtensionPointName::class.java, List::class.java, Disposable::class.java)
                .invoke(null, name, extensions, disposable)
        }
    }

    /**
     * Can be removed when min-version is 19.3 FIX_WHEN_MIN_IS_193
     */
    @TestOnly
    fun createProject(path: Path): Project {
        val heavyTestCaseClass = tryOrNull { Class.forName("com.intellij.testFramework.HeavyPlatformTestCase") }
        if (heavyTestCaseClass != null) {
            // New method
            val method = heavyTestCaseClass.getMethod("createProject", Path::class.java)
            return method.invoke(null, path) as Project
        }
        val legacyCreate = PlatformTestCase::class.java.getMethod("createProject", File::class.java, String::class.java)
        return legacyCreate.invoke(null, path.toFile(), "Fake") as Project
    }

    /**
     * Can be removed when min-version is 19.3 FIX_WHEN_MIN_IS_193
     *
     * Can be replaced with RemoteDebuggingFileFinder(mappings, LocalFileSystemFileFinder(false)) at the call-site
     */
    inline fun <reified Remote : Any> createRemoteDebuggingFileFinder(
        mappings: BiMap<String, VirtualFile>,
        localFileFinder: Any
    ): Remote {
        val parentClass = localFileFinder::class.java.superclass.takeIf { it != Any::class.java } ?: localFileFinder::class.java.interfaces.first()
        val constructor = Remote::class.java.getConstructor(BiMap::class.java, parentClass)
        return constructor.newInstance(mappings, localFileFinder)
    }

    /**
     * Can be removed when min-version is 19.3 FIX_WHEN_MIN_IS_193
     *
     * Can be replaced with Dispatchers.ApplicationThreadPool at the call-site
     * ApplicationThreadPool is an extension val defined as an util in JetBrains' platform-impl
     */
    @Suppress("unused") // unused receiver
    val ApplicationThreadPool: CoroutineDispatcher
        get() = AppExecutorUtil.getAppExecutorService().asCoroutineDispatcher()
}
