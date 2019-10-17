// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import com.intellij.openapi.Disposable
import com.intellij.openapi.extensions.ExtensionPoint
import com.intellij.openapi.extensions.ExtensionPointName
import com.intellij.openapi.project.Project
import com.intellij.testFramework.PlatformTestCase
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
        val extensionTestUtil = tryOrNull { Class.forName("com.intellij.testFramework.ExtensionTestUtil") }

        if (extensionTestUtil != null) {
            extensionTestUtil.getMethod("maskExtensions", ExtensionPointName::class.java, List::class.java, Disposable::class.java)
                .invoke(null, name, listOf(extension), disposable)
        } else {
            val oldRegister = ExtensionPoint::class.java.getMethod("registerExtension", Object::class.java, Disposable::class.java)
            val ep = name.getPoint(null)
            oldRegister.invoke(ep, extension, disposable)
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
}
