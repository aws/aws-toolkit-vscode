// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import com.intellij.openapi.Disposable
import com.intellij.openapi.extensions.ExtensionPoint
import com.intellij.openapi.extensions.ExtensionPointName
import com.intellij.openapi.module.ModuleType
import com.intellij.openapi.module.ModuleTypeId
import com.intellij.openapi.module.ModuleTypeManager
import com.intellij.openapi.module.WebModuleTypeBase
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.ComponentValidator
import com.intellij.openapi.ui.ValidationInfo
import com.intellij.openapi.ui.popup.ComponentPopupBuilder
import com.intellij.testFramework.PlatformTestCase
import com.intellij.testFramework.PlatformTestUtil
import org.jetbrains.annotations.TestOnly
import software.aws.toolkits.core.utils.tryOrNull
import java.io.File
import java.nio.file.Path
import java.util.function.Consumer
import javax.swing.JEditorPane
import kotlin.jvm.internal.Reflection
import kotlin.reflect.full.staticFunctions

/**
 * A set of functions that attempt to abstract API differences that are incompatible between IDEA versions.
 *
 * This can act as a central place where said logic can be removed as min-version increases
 */
object CompatibilityUtils {

    /**
     * Can be removed when min-version is 19.1 FIX_WHEN_MIN_IS_191
     */
    @JvmStatic
    fun createPopupBuilder(validationInfo: ValidationInfo, configurator: Consumer<JEditorPane>?): ComponentPopupBuilder? =
        ComponentValidator::class.staticFunctions.find { it.name == "createPopupBuilder" }?.call(validationInfo, configurator) as? ComponentPopupBuilder

    /**
     * Can be removed when min-version is 19.1 FIX_WHEN_MIN_IS_191
     */
    @TestOnly
    fun <T> registerExtension(name: ExtensionPointName<T>, extension: T, disposable: Disposable) {

        val newRegister = tryOrNull { ExtensionPoint::class.java.getMethod("registerExtension", Object::class.java, Disposable::class.java) }

        if (newRegister != null) {
            val ep = name.getPoint(null)
            newRegister.invoke(ep, extension, disposable)
        } else {
            val legacyRegister = PlatformTestUtil::class.java.getMethod("registerExtension",
                ExtensionPointName::class.java,
                Object::class.java,
                Disposable::class.java)
            legacyRegister.invoke(null, name, extension, disposable)
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
     * FIX_WHEN_MIN_IS_192 WebModuleType.getInstance() is deprecated in 191, use WebModuleTypeBase#getInstance for version 191+
     */
    fun getWebModule(): ModuleType<*>? {
        val module = (WebModuleTypeBase::class.staticFunctions
            .find { it.name == "getInstance" }
            ?.call() as? WebModuleTypeBase<*>) ?: ModuleTypeManager.getInstance()
            .findByID(ModuleTypeId.WEB_MODULE) as? WebModuleTypeBase

        if (module != null) {
            return module
        }
        return (tryOrNull { Class.forName("com.intellij.webcore.moduleType.WebModuleTypeManager") }?.let {
            Reflection.createKotlinClass(it)
        }?.staticFunctions?.find { it.name == "getInstance" }?.call() as? ModuleTypeManager)?.defaultModuleType
    }
}
